import re
import os

files = ['src/components/GlobalShipmentForm.jsx', 'src/components/GlobalJobForm.jsx']
for filepath in files:
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            matches = re.findall(r'label:\s*[\'\"](.*?(?:Customer|Client).*?)[\'\"]', content, re.I)
            print(f'{filepath} fields:', set(matches))
