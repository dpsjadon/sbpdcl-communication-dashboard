import os
import glob
import pandas as pd

data_dir = r"C:\Users\Dharmendra Pal Singh\.gemini\antigravity-ide\scratch\sbpdcl-noncomm-dashboard\data"
downloads_dir = r"C:\Users\Dharmendra Pal Singh\.gemini\antigravity-ide\scratch\sbpdcl-noncomm-dashboard\downloads"

print("--- INSPECTING AIRTEL CSV ---")
airtel_files = glob.glob(os.path.join(data_dir, "*Airtel*.csv"))
if airtel_files:
    df_airtel = pd.read_csv(airtel_files[0], nrows=5)
    print("Airtel Columns:", list(df_airtel.columns))
    print("Airtel Sample Row 0:\n", df_airtel.iloc[0].to_dict())

print("\n--- INSPECTING CYAN EXCEL ---")
cyan_file = os.path.join(downloads_dir, "HES-Cyan-NonCommunicating_7Day.xlsx")
if os.path.exists(cyan_file):
    df_cyan = pd.read_excel(cyan_file, nrows=5)
    print("Cyan Columns:", list(df_cyan.columns))
    print("Cyan Sample Row 0:\n", df_cyan.iloc[0].to_dict())

print("\n--- INSPECTING PREPAID TOTAL CONSUMERS (MASTER) ---")
prepaid_files = glob.glob(os.path.join(data_dir, "*Prepaid*.csv"))
for pf in prepaid_files:
    print(f"File: {os.path.basename(pf)} ({os.path.getsize(pf) / (1024*1024):.2f} MB)")
    df_p = pd.read_csv(pf, nrows=5)
    print("Columns:", list(df_p.columns))
    print("Sample Row 0:\n", df_p.iloc[0].to_dict())
    print("-" * 50)
