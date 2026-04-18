
import pandas as pd
import os
import glob
import re
import sqlite3

def load_dataframes_from_drive(drive_path):
    """Loads all CSV and Excel files from a specified Google Drive path."""
    all_dataframes = {}
    # Load CSVs
    csv_files = glob.glob(os.path.join(drive_path, '*.csv'))
    for file_path in csv_files:
        try:
            file_name = os.path.basename(file_path)
            all_dataframes[file_name] = pd.read_csv(file_path)
        except Exception as e:
            print(f"Error loading CSV {file_name}: {e}")

    # Load Excel files
    excel_files = glob.glob(os.path.join(drive_path, '*.xlsx')) + glob.glob(os.path.join(drive_path, '*.xls'))
    for file_path in excel_files:
        try:
            file_name = os.path.basename(file_path)
            all_dataframes[file_name] = pd.read_excel(file_path)
        except Exception as e:
            print(f"Error loading Excel {file_name}: {e}")
    
    # Load CSVs from NGA_2025_HFCP_v01_M_CSV folder
    matching_folders = glob.glob(os.path.join(drive_path, 'NGA_2025_HFCP*'))
    if matching_folders:
        folder_path = matching_folders[0]
        folder_csv_files = glob.glob(os.path.join(folder_path, '*.csv'))
        for file_path in folder_csv_files:
            try:
                file_name = os.path.basename(file_path)
                all_dataframes[file_name] = pd.read_csv(file_path)
            except Exception as e:
                print(f"Error loading CSV from folder {file_name}: {e}")

    return all_dataframes

def clean_excel_dataframes(all_excel_dataframes):
    """Cleans and consolidates Excel dataframes."""
    cleaned_excel_dataframes = {}
    for file_name, df in all_excel_dataframes.items():
        temp_df = df.copy()

        if not temp_df.empty and len(temp_df) > 0:
            if (isinstance(temp_df.columns[0], str) and temp_df.columns[0].startswith('Unnamed:')) or \
               (isinstance(temp_df.iloc[0, 0], str) and temp_df.iloc[0, 0].strip() in ['Items Label', 'Items', 'ItemLabels', 'NORTH CENTRAL'] and temp_df.columns[0] != temp_df.iloc[0,0]):
                temp_df.columns = temp_df.iloc[0]
                temp_df = temp_df[1:].reset_index(drop=True)

            temp_df = temp_df.loc[:, temp_df.columns.notna()]
            temp_df.columns = temp_df.columns.astype(str).str.strip()

            cols = []
            seen = {}
            for item in temp_df.columns:
                original_name = str(item).strip()
                name = original_name
                count = 0
                while name in seen:
                    count += 1
                    name = f"{original_name}_{count}"
                cols.append(name)
                seen[name] = True
            temp_df.columns = cols

        if 'Items Label' in temp_df.columns:
            temp_df = temp_df[temp_df['Items Label'].notna()]
            temp_df = temp_df[temp_df['Items Label'] != 'NORTH CENTRAL']
            temp_df = temp_df.dropna(how='all')
        elif 'Items' in temp_df.columns:
            temp_df = temp_df[temp_df['Items'].notna()]
            temp_df = temp_df[temp_df['Items'] != 'NORTH CENTRAL']
            temp_df = temp_df.dropna(how='all')

        price_columns = [col for col in temp_df.columns if col.startswith('Average of')]
        id_vars = [col for col in temp_df.columns if col not in price_columns]
        id_vars = list(dict.fromkeys(id_vars))
        id_vars = [col for col in id_vars if col in temp_df.columns]

        if price_columns and not temp_df.empty:
            melted_df = pd.melt(temp_df, id_vars=id_vars, value_vars=price_columns, var_name='Month_Year_Avg', value_name='Price')
            melted_df['Date_Str'] = melted_df['Month_Year_Avg'].str.replace('Average of ', '', regex=False)
            melted_df['Date'] = pd.to_datetime(melted_df['Date_Str'], format='%b-%y', errors='coerce')
            melted_df['Date'] = melted_df['Date'].fillna(pd.to_datetime(melted_df['Date_Str'], format='%b-%Y', errors='coerce'))
            melted_df = melted_df.dropna(subset=['Date'])
            melted_df['Price'] = pd.to_numeric(melted_df['Price'], errors='coerce')
            melted_df = melted_df.dropna(subset=['Price'])
            melted_df = melted_df.drop(columns=['Month_Year_Avg', 'Date_Str'], errors='ignore')
            cleaned_excel_dataframes[file_name] = melted_df

    all_cleaned_food_prices_df = pd.concat(cleaned_excel_dataframes.values(), ignore_index=True)

    all_cleaned_food_prices_df['Item'] = all_cleaned_food_prices_df['Items Label'].fillna(
        all_cleaned_food_prices_df['Items']).fillna(
        all_cleaned_food_prices_df['ItemLabel']).fillna(
        all_cleaned_food_prices_df['ITEMS']).fillna(
        all_cleaned_food_prices_df['Items_1']
    )
    all_cleaned_food_prices_df['MoM'] = pd.to_numeric(all_cleaned_food_prices_df['MoM'], errors='coerce')
    all_cleaned_food_prices_df['YoY'] = pd.to_numeric(all_cleaned_food_prices_df['YoY'], errors='coerce')

    def extract_price_location(text):
        if pd.isna(text):
            return None, None
        text = str(text).strip()
        match = re.search(r'(.+)\s*\(([-+]?\d*\.?\d+)\)', text)
        if match:
            location = match.group(1).strip()
            price = float(match.group(2))
            return price, location
        try:
            price = float(text)
            return price, None
        except ValueError:
            return None, text

    all_cleaned_food_prices_df[['Highest_Price', 'Highest_Location']] = all_cleaned_food_prices_df['Highest'].apply(lambda x: pd.Series(extract_price_location(x)))
    all_cleaned_food_prices_df[['Lowest_Price', 'Lowest_Location']] = all_cleaned_food_prices_df['Lowest'].apply(lambda x: pd.Series(extract_price_location(x)))

    columns_to_drop = [
        'Items Label', 'Items', 'ItemLabel', 'ITEMS', 'Items_1',
        'Highest', 'Lowest', 'Unnamed: 8', 'Unnamed: 9', 'Unnamed: 10', 'Grand Total'
    ]
    regional_cols = ['NORTH CENTRAL', 'NORTH EAST', 'NORTH WEST', 'SOUTH EAST', 'SOUTH SOUTH', 'SOUTH WEST']
    all_cleaned_food_prices_df = all_cleaned_food_prices_df.drop(
        columns=[col for col in columns_to_drop + regional_cols if col in all_cleaned_food_prices_df.columns]
    )
    
    all_cleaned_food_prices_df['Highest_Price'] = all_cleaned_food_prices_df['Highest_Price'].fillna(all_cleaned_food_prices_df['Price'])
    all_cleaned_food_prices_df['Lowest_Price'] = all_cleaned_food_prices_df['Lowest_Price'].fillna(all_cleaned_food_prices_df['Price'])

    all_cleaned_food_prices_df['COMMODITY_SLUG'] = all_cleaned_food_prices_df['Item'].str.lower().str.replace(' ', '_')
    all_cleaned_food_prices_df['MARKET_SLUG'] = 'nigeria_national_market'
    
    return all_cleaned_food_prices_df

def clean_detailed_csv_dataframes(all_dataframes):
    """Cleans and consolidates detailed CSV dataframes from HFCP folder."""
    cleaned_detailed_csv_dataframes = {}
    hfcp_csv_files = [k for k in all_dataframes.keys() if k.startswith('level2_price_') or k == 'Raw_data_spatialrev.csv']

    for file_name in hfcp_csv_files:
        df = all_dataframes[file_name].copy()
        df.columns = df.columns.str.lower().str.replace(' ', '_')

        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'], errors='coerce')
            df = df.dropna(subset=['date'])

        for col in ['price', 'daily_mean', 'daily_sd']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')

        subset_for_dropna = []
        if 'price' in df.columns:
            subset_for_dropna.append('price')
        if 'commodity' in df.columns:
            subset_for_dropna.append('commodity')

        if subset_for_dropna:
            df = df.dropna(subset=subset_for_dropna)
        
        # Create COMMODITY_SLUG for all_cleaned_detailed_prices_df
        df['COMMODITY_SLUG'] = df['commodity'].str.lower().str.replace(' ', '_')

        # Create MARKET_SLUG for all_cleaned_detailed_prices_df
        def create_market_slug(row):
            components = []
            if pd.notna(row['geopol_zon']):
                components.append(str(row['geopol_zon']))
            if pd.notna(row['statelabel']):
                components.append(str(row['statelabel']))
            if pd.notna(row['lgalabel']):
                components.append(str(row['lgalabel']))
            slug = '_'.join(components).lower()
            slug = re.sub(r'[^a-z0-9_]', '', slug)
            return slug

        df['MARKET_SLUG'] = df.apply(create_market_slug, axis=1)

        cleaned_detailed_csv_dataframes[file_name] = df

    all_cleaned_detailed_prices_df = pd.concat(cleaned_detailed_csv_dataframes.values(), ignore_index=True)
    return all_cleaned_detailed_prices_df

def prepare_cpi_data(all_dataframes):
    """Prepares CPI data for real price calculations."""
    cpi_df = all_dataframes['consumer-price-indices_nga.csv'].copy()
    cpi_df['StartDate'] = pd.to_datetime(cpi_df['StartDate'], errors='coerce')
    cpi_df['Value'] = pd.to_numeric(cpi_df['Value'], errors='coerce')
    cpi_df = cpi_df.dropna(subset=['StartDate', 'Value'])
    cpi_df = cpi_df.sort_values(by='StartDate').reset_index(drop=True)

    cpi_filtered_df = cpi_df[cpi_df['Item'] == 'Consumer Prices, General Indices (2015 = 100)'].copy()
    cpi_filtered_df['YearMonth'] = cpi_filtered_df['StartDate'].dt.to_period('M')
    cpi_monthly_avg = cpi_filtered_df.groupby('YearMonth')['Value'].mean().reset_index()
    cpi_monthly_avg.rename(columns={'Value': 'cpi_value'}, inplace=True)
    
    cpi_2024 = cpi_monthly_avg[cpi_monthly_avg['YearMonth'].dt.year == 2024]['cpi_value']
    if not cpi_2024.empty:
        base_cpi = cpi_2024.mean()
    else:
        base_cpi = cpi_monthly_avg['cpi_value'].mean()
    
    return cpi_monthly_avg, base_cpi

def prepare_final_prices_df(all_cleaned_detailed_prices_df, all_cleaned_food_prices_df, cpi_monthly_avg, base_cpi):
    """Prepares and consolidates all price data into a single DataFrame."""
    # Prepare HFCP data
    detailed_prices_with_cpi = all_cleaned_detailed_prices_df.copy()
    detailed_prices_with_cpi['YearMonth'] = detailed_prices_with_cpi['date'].dt.to_period('M')
    detailed_prices_with_cpi = pd.merge(
        detailed_prices_with_cpi,
        cpi_monthly_avg,
        on='YearMonth',
        how='left'
    )
    detailed_prices_with_cpi['price_real'] = (detailed_prices_with_cpi['price'] / detailed_prices_with_cpi['cpi_value']) * base_cpi
    detailed_prices_with_cpi['price_real'] = detailed_prices_with_cpi['price_real'].fillna(detailed_prices_with_cpi['price'])
    detailed_prices_with_cpi['date'] = detailed_prices_with_cpi['date'].dt.strftime('%Y-%m-01')
    detailed_prices_with_cpi['month'] = detailed_prices_with_cpi['date'].astype(str).str[5:7].astype(int) # Extract month as int
    detailed_prices_with_cpi['year'] = detailed_prices_with_cpi['date'].astype(str).str[0:4].astype(int) # Extract year as int
    detailed_prices_with_cpi['price_ngn'] = detailed_prices_with_cpi['price']
    detailed_prices_with_cpi['unit'] = 'kg'
    detailed_prices_with_cpi['source'] = 'hfcp'
    detailed_prices_with_cpi['is_interpolated'] = 0
    prices_hfcp_df = detailed_prices_with_cpi[[
        'COMMODITY_SLUG',
        'MARKET_SLUG',
        'date',
        'month',
        'year',
        'price_ngn',
        'price_real',
        'unit',
        'source',
        'is_interpolated'
    ]].rename(columns={
        'COMMODITY_SLUG': 'commodity',
        'MARKET_SLUG': 'market'
    })

    # Prepare NBS data
    food_prices_with_cpi = all_cleaned_food_prices_df.copy()
    food_prices_with_cpi['YearMonth'] = food_prices_with_cpi['Date'].dt.to_period('M')
    food_prices_with_cpi = pd.merge(
        food_prices_with_cpi,
        cpi_monthly_avg,
        on='YearMonth',
        how='left'
    )
    food_prices_with_cpi['price_real'] = (food_prices_with_cpi['Price'] / food_prices_with_cpi['cpi_value']) * base_cpi
    food_prices_with_cpi['price_real'] = food_prices_with_cpi['price_real'].fillna(food_prices_with_cpi['Price'])
    food_prices_with_cpi['date'] = food_prices_with_cpi['Date'].dt.strftime('%Y-%m-01')
    food_prices_with_cpi['month'] = food_prices_with_cpi['Date'].dt.month
    food_prices_with_cpi['year'] = food_prices_with_cpi['Date'].dt.year
    food_prices_with_cpi['price_ngn'] = food_prices_with_cpi['Price']
    food_prices_with_cpi['unit'] = 'kg'
    food_prices_with_cpi['source'] = 'nbs'
    food_prices_with_cpi['is_interpolated'] = 0
    prices_nbs_df = food_prices_with_cpi[[
        'COMMODITY_SLUG',
        'MARKET_SLUG',
        'date',
        'month',
        'year',
        'price_ngn',
        'price_real',
        'unit',
        'source',
        'is_interpolated'
    ]].rename(columns={
        'COMMODITY_SLUG': 'commodity',
        'MARKET_SLUG': 'market'
    })

    final_prices_df = pd.concat([prices_hfcp_df, prices_nbs_df], ignore_index=True)
    final_prices_df_cleaned = final_prices_df.dropna(subset=['commodity', 'price_ngn', 'price_real'])
    final_prices_df_cleaned['date'] = pd.to_datetime(final_prices_df_cleaned['date'])
    return final_prices_df_cleaned

def generate_market_differentials(analysis_df, output_dir):
    """Calculates and saves market price differentials."""
    national_avg_prices = analysis_df.groupby(['Date', 'Item'])['price'].mean().reset_index()
    national_avg_prices.rename(columns={'price': 'national_avg_price'}, inplace=True)

    market_avg_prices = analysis_df.groupby(['Date', 'Item', 'MARKET_SLUG'])['price'].mean().reset_index()
    market_avg_prices.rename(columns={'price': 'market_avg_price'}, inplace=True)

    market_differentials = pd.merge(market_avg_prices,
                                    national_avg_prices,
                                    on=['Date', 'Item'],
                                    how='left')
    market_differentials['price_differential'] = market_differentials['market_avg_price'] - market_differentials['national_avg_price']

    market_differentials_final = market_differentials[[
        'Date', 'Item', 'MARKET_SLUG', 'market_avg_price', 'national_avg_price', 'price_differential'
    ]].copy()

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    market_differentials_final.to_csv(os.path.join(output_dir, 'market_differentials.csv'), index=False)
    print("Generated market_differentials.csv")

def generate_seasonal_patterns(analysis_df, output_dir):
    """Calculates and saves seasonal price patterns."""
    analysis_df['month'] = analysis_df['Date'].dt.month
    analysis_df['year'] = analysis_df['Date'].dt.year

    monthly_avg_prices = analysis_df.groupby(['Item', 'month'])['price'].mean().reset_index()
    monthly_avg_prices.rename(columns={'price': 'avg_monthly_price'}, inplace=True)

    commodity_annual_avg = analysis_df.groupby('Item')['price'].mean().reset_index()
    commodity_annual_avg.rename(columns={'price': 'overall_avg_price'}, inplace=True)

    seasonal_patterns = pd.merge(monthly_avg_prices,
                                 commodity_annual_avg,
                                 on='Item',
                                 how='left')
    seasonal_patterns['seasonal_index'] = (seasonal_patterns['avg_monthly_price'] / seasonal_patterns['overall_avg_price']) * 100

    seasonal_patterns_final = seasonal_patterns[[
        'Item', 'month', 'avg_monthly_price', 'seasonal_index'
    ]].copy()

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    seasonal_patterns_final.to_csv(os.path.join(output_dir, 'seasonal_patterns.csv'), index=False)
    print("Generated seasonal_patterns.csv")

def main(drive_path, output_dir, db_path):
    print("Starting data pipeline...")
    all_dataframes = load_dataframes_from_drive(drive_path)

    # Separate Excel and CSV dataframes for cleaning functions
    all_excel_dataframes = {k: v for k, v in all_dataframes.items() if k.endswith(('.xlsx', '.xls'))}
    # Note: all_dataframes already contains CSVs from the HFCP folder, so we don't need a separate filter for that here.

    all_cleaned_food_prices_df = clean_excel_dataframes(all_excel_dataframes)
    all_cleaned_detailed_prices_df = clean_detailed_csv_dataframes(all_dataframes)

    cpi_monthly_avg, base_cpi = prepare_cpi_data(all_dataframes)

    final_prices_df_cleaned = prepare_final_prices_df(all_cleaned_detailed_prices_df, all_cleaned_food_prices_df, cpi_monthly_avg, base_cpi)

    # Save to SQLite
    conn = sqlite3.connect(db_path)
    final_prices_df_cleaned.to_sql('prices', conn, if_exists='replace', index=False)
    conn.close()
    print(f"Data successfully saved to '{db_path}' in table 'prices'.")

    # Prepare analysis_df for market differentials and seasonal patterns
    analysis_df = all_cleaned_detailed_prices_df.copy()
    analysis_df['Date'] = pd.to_datetime(analysis_df['date']) # Ensure 'Date' is datetime
    analysis_df['price'] = pd.to_numeric(analysis_df['price'], errors='coerce')
    analysis_df.dropna(subset=['Date', 'price', 'commodity', 'MARKET_SLUG'], inplace=True)
    analysis_df.rename(columns={'commodity': 'Item'}, inplace=True)

    generate_market_differentials(analysis_df, output_dir)
    generate_seasonal_patterns(analysis_df, output_dir)
    
    print("Data pipeline finished.")

if __name__ == '__main__':
    drive_path = '/content/gdrive/My Drive/'
    output_dir = os.path.join(drive_path, 'data')
    db_path = os.path.join(drive_path, 'prices_clean.db')
    main(drive_path, output_dir, db_path)
