import os
import re

files = ['src/components/Login.jsx', 'src/components/Register.jsx', 'src/components/ForgotPassword.jsx', 'src/components/ResetPassword.jsx', 'src/App.jsx']

for filepath in files:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        if 'img src={sealLogo}' not in content and 'Seal Logistics</span>' in content:
            # For each file, we want to replace the span containing Seal Logistics with a flex div containing the logo and the span
            # We can use regex to match <span ...>Seal Logistics</span>
            pattern = re.compile(r'(<span[^>]*>Seal Logistics</span>)')
            replacement = r"<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src={sealLogo} alt='Seal Logistics Logo' style={{ height: '40px', marginRight: '15px' }} />\1</div>"
            new_content = pattern.sub(replacement, content)
            
            # Make sure sealLogo is imported
            if 'import sealLogo' not in new_content:
                if 'src/App.jsx' in filepath:
                    new_content = new_content.replace("import { useState", "import sealLogo from './seal.png';\nimport { useState")
                else:
                    new_content = new_content.replace("import { useState", "import sealLogo from '../seal.png';\nimport { useState")

            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated {filepath}")
    except Exception as e:
        print(f"Failed {filepath}: {e}")
