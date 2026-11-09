"""
Google Drive Sync for Anime Reels
Downloads anime video reels from the configured Google Drive folder into the local reels staging directory.
"""

import os
import sys
import argparse
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config.json"

def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def sync_drive(batch_limit=5, download_all=False):
    config = load_config()
    folder_url = config.get("driveFolderUrl")
    folder_id = config.get("driveFolderId")
    reels_dir = BASE_DIR / "reels"
    reels_dir.mkdir(parents=True, exist_ok=True)

    print(f"[*] Target folder ID: {folder_id}")
    print(f"[*] Staging directory: {reels_dir}")

    try:
        import gdown
        print(f"[*] Contacting Google Drive for folder: {folder_url}")
        
        # Download folder contents
        files = gdown.download_folder(
            id=folder_id,
            output=str(reels_dir),
            quiet=False,
            use_cookies=False,
            resume=True
        )
        
        count = len(list(reels_dir.glob("*.mp4"))) + len(list(reels_dir.glob("*.mov")))
        print(f"[+] Download complete! Currently {count} video files staged in {reels_dir}")
        return True

    except Exception as e:
        print(f"[!] Direct folder download hit a limit or notice: {e}")
        print("\n" + "="*60)
        print("GOOGLE DRIVE TIP (as noted in your purchase document):")
        print("Due to high download traffic on the vendor's link, you can:")
        print(f"1. Open in browser: {folder_url}")
        print("2. Click '...' -> 'Make a copy' to your own Google Drive")
        print("3. Download a batch of 10-20 mp4 files directly and place them into:")
        print(f"   {reels_dir}")
        print("="*60 + "\n")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync reels from Google Drive")
    parser.add_argument("--batch", type=int, default=5, help="Number of files to download")
    parser.add_argument("--all", action="store_true", help="Download all files in folder")
    args = parser.parse_args()

    sync_drive(batch_limit=args.batch, download_all=args.all)
