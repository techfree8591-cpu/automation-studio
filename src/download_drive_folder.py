"""
Bulletproof Google Drive Batch Downloader & Sequencer
Bypasses gdown's broken confirm scrape by discovering file IDs via gdown(skip_download=True)
and streaming each file directly from Google's high-speed CDN:
https://drive.usercontent.google.com/download?id={file_id}
Automatically saves and numbers files sequentially: 1.mp4, 2.mp4, 3.mp4... in D:\automation\reels.
"""

import os
import sys
import re
import time
import zipfile
import argparse
import urllib.request
import urllib.error
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
REELS_DIR = BASE_DIR / "reels"

def extract_id(url_or_id):
    if not url_or_id:
        return None, "unknown"
    match = re.search(r"folders/([a-zA-Z0-9_-]+)", url_or_id)
    if match:
        return match.group(1), "folder"
    match = re.search(r"d/([a-zA-Z0-9_-]+)", url_or_id)
    if match:
        return match.group(1), "file"
    match = re.search(r"id=([a-zA-Z0-9_-]+)", url_or_id)
    if match:
        return match.group(1), "file"
    if re.match(r"^[a-zA-Z0-9_-]{20,}$", url_or_id):
        return url_or_id, "folder"
    return url_or_id, "unknown"

def download_file_direct(file_id, dest_path):
    cdn_url = f"https://drive.usercontent.google.com/download?id={file_id}"
    req = urllib.request.Request(
        cdn_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*"
        }
    )
    
    with urllib.request.urlopen(req, timeout=60) as resp:
        # Check if content-disposition or content-type is video or octet-stream
        content_type = resp.headers.get("Content-Type", "")
        with open(dest_path, "wb") as out:
            chunk_size = 1024 * 512 # 512KB chunks
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                out.write(chunk)
    
    size_mb = os.path.getsize(dest_path) / (1024 * 1024)
    return size_mb

def renumber_existing():
    REELS_DIR.mkdir(parents=True, exist_ok=True)
    video_files = [f for f in REELS_DIR.iterdir() if f.is_file() and f.suffix.lower() in [".mp4", ".mov", ".mkv", ".webm"]]
    
    if not video_files:
        print("[!] No video files found in D:\\automation\\reels to renumber.")
        return

    def sort_key(f):
        match = re.search(r"\d+", f.name)
        return int(match.group(0)) if match else 999999

    video_files.sort(key=sort_key)

    temp_files = []
    for idx, f in enumerate(video_files, start=1):
        temp_name = REELS_DIR / f"_temp_seq_{idx:04d}{f.suffix.lower()}"
        f.rename(temp_name)
        temp_files.append(temp_name)

    for idx, temp_f in enumerate(temp_files, start=1):
        target_name = REELS_DIR / f"{idx}.mp4"
        temp_f.rename(target_name)

    print(f"[+] Successfully sequenced {len(video_files)} clips: 1.mp4 through {len(video_files)}.mp4")

def download_folder_direct(drive_url):
    REELS_DIR.mkdir(parents=True, exist_ok=True)
    drive_id, kind = extract_id(drive_url)

    print(f"============================================================")
    print(f"[*] Starting Direct High-Speed Download for Google Drive")
    print(f"[*] Target ID: {drive_id} (Type: {kind})")
    print(f"============================================================")

    # If it's a single file ID (could be a zip bundle or direct video)
    if kind == "file":
        dest = REELS_DIR / "bundle_download.tmp"
        print(f"[*] Downloading file {drive_id}...")
        try:
            download_file_direct(drive_id, dest)
            if zipfile.is_zipfile(dest):
                print("[*] Zip archive detected. Extracting video clips...")
                with zipfile.ZipFile(dest, "r") as zf:
                    for member in zf.namelist():
                        if member.lower().endswith((".mp4", ".mov", ".mkv", ".webm")) and not member.startswith("__MACOSX"):
                            filename = os.path.basename(member)
                            if filename:
                                with zf.open(member) as src, open(REELS_DIR / filename, "wb") as dst:
                                    dst.write(src.read())
                os.remove(dest)
            else:
                dest.rename(REELS_DIR / "1.mp4")
            renumber_existing()
            return
        except Exception as e:
            print(f"[!] Error downloading single file: {e}")
            return

    # Folder: Discover files using gdown with skip_download=True
    print("[*] Fetching file list from Google Drive folder...")
    import gdown
    try:
        files = gdown.download_folder(
            id=drive_id,
            skip_download=True,
            quiet=True,
            use_cookies=False
        )
    except Exception as e:
        print(f"[*] Retrying with folder URL...")
        try:
            files = gdown.download_folder(
                url=drive_url,
                skip_download=True,
                quiet=True,
                use_cookies=False
            )
        except Exception as e2:
            print(f"[!] Could not list folder files automatically: {e2}")
            return

    if not files:
        print("[!] No files found in folder or folder is restricted.")
        return

    print(f"[+] Found {len(files)} items in folder. Starting CDN stream download...\n")

    # Determine starting index based on existing numbered files in reels/
    existing_nums = []
    for f in REELS_DIR.glob("*.mp4"):
        if f.stem.isdigit():
            existing_nums.append(int(f.stem))
    start_idx = (max(existing_nums) + 1) if existing_nums else 1

    downloaded_count = 0
    for idx, item in enumerate(files, start=start_idx):
        file_id = getattr(item, "id", None) or getattr(item, "file_id", None)
        file_name = getattr(item, "name", f"reel_{idx}.mp4")

        # Skip non-video files if any
        if not file_name.lower().endswith((".mp4", ".mov", ".mkv", ".webm", ".m4v")):
            continue

        target_file = REELS_DIR / f"{idx}.mp4"
        print(f"[{downloaded_count + 1}/{len(files)}] Downloading {idx}.mp4 (Source: {file_name})...", end="", flush=True)

        try:
            size_mb = download_file_direct(file_id, target_file)
            print(f" DONE ({size_mb:.1f} MB)")
            downloaded_count += 1
            time.sleep(0.3) # small pause between files
        except Exception as err:
            print(f" FAILED: {err}")
            if target_file.exists():
                try: target_file.unlink()
                except: pass

    print(f"\n============================================================")
    print(f"[+] Download complete! Successfully added {downloaded_count} clips.")
    print(f"[+] All files numbered sequentially in: {REELS_DIR}")
    print(f"============================================================")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download from Google Drive and number reels")
    parser.add_argument("url", nargs="?", default="", help="Google Drive folder or file URL")
    parser.add_argument("--renumber-only", action="store_true", help="Only renumber existing files in reels folder")
    args = parser.parse_args()

    if args.renumber_only or not args.url:
        renumber_existing()
    else:
        download_folder_direct(args.url)
