import json
import random
import os

try:
    from datasets import load_dataset
except ImportError:
    print("Please install the datasets library first: pip install datasets")
    exit(1)

OUTPUT_FILE = 'data/hf_dataset.json'
SAMPLE_SIZE = 6000  # Total items (2000 per language)

def process_dataset(dataset, lang, limit, source_name):
    data = []
    print(f"Processing {lang} from {source_name} (limit {limit})...")
    count = 0
    for item in dataset:
        if count >= limit: break
        text = item.get('text', '')
        # Filter for length 50-500 to match "Tweet/Review" style
        if 50 <= len(text) <= 500:
            data.append({
                "id": f"{lang}_{count}",
                "text": text,
                "metadata": {
                    "source": f"{source_name}-{lang}",
                    "lang": lang
                }
            })
            count += 1
    return data

def main():
    all_data = []
    
    # We use 'xu-song/cc100-samples' which contains samples from CC-100 dataset.
    # It is likely to work without custom scripts (Parquet/JSON based) or be well supported.
    # It has 'en', 'zh-Hans', 'ja'.
    
    # 1. English
    try:
        print("Downloading English data...")
        # streaming=False because it is a sample dataset (small)
        ds_en = load_dataset("xu-song/cc100-samples", "en", split="train", trust_remote_code=True)
        all_data.extend(process_dataset(ds_en, "en", SAMPLE_SIZE // 3, "cc100"))
    except Exception as e:
        print(f"Error loading English: {e}")

    # 2. Chinese
    try:
        print("Downloading Chinese data...")
        ds_zh = load_dataset("xu-song/cc100-samples", "zh-Hans", split="train", trust_remote_code=True)
        all_data.extend(process_dataset(ds_zh, "zh", SAMPLE_SIZE // 3, "cc100"))
    except Exception as e:
        print(f"Error loading Chinese: {e}")

    # 3. Japanese
    try:
        print("Downloading Japanese data...")
        ds_ja = load_dataset("xu-song/cc100-samples", "ja", split="train", trust_remote_code=True)
        all_data.extend(process_dataset(ds_ja, "ja", SAMPLE_SIZE // 3, "cc100"))
    except Exception as e:
        print(f"Error loading Japanese: {e}")

    # Shuffle
    random.shuffle(all_data)
    
    print(f"Total documents prepared: {len(all_data)}")
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)
    
    print(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
