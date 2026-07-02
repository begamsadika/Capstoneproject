import pandas as pd

# Define the path to the Excel file
dataset_path = 'DataSets/Drug to Food interactions Dataset.xlsx'

# Load the Excel file to inspect column names
try:
    data = pd.read_excel(dataset_path)
    print("Column Names:", data.columns.tolist())
except Exception as e:
    print(f"Error reading the file: {e}")