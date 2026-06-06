import os

def replace_in_file():
    filepath = 'src/components/Sidebar.jsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    import_statement = "import sealLogo from '../seal.png'\n"
    if 'sealLogo' not in content:
        content = content.replace("import { useState } from 'react'", "import { useState } from 'react'\n" + import_statement)

    logo_img = "<img src={sealLogo} alt='Seal Freight Logo' style={{ height: '30px', marginRight: '10px' }} />"
    span_text = "<span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#4f46e5' }}>Seal Freight</span>"
    replacement = f"<div style={{ display: 'flex', alignItems: 'center' }}>{logo_img}{span_text}</div>"

    content = content.replace(span_text, replacement)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Sidebar updated.")

replace_in_file()
