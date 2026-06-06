filepath = 'src/components/PDFGenerator.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

import_stmt = "import sealLogo from '../seal.png';\n"
if 'sealLogo' not in content:
    content = content.replace("import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';", 
        "import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';\n" + import_stmt)

# replace empty View logo with Image
content = content.replace('<View style={styles.logo} />', '<Image src={sealLogo} style={styles.logo} />')
content = content.replace('SEAL FREIGHT FORWARDERS PVT. LTD.', 'SEAL LOGISTICS')
content = content.replace('Seal Freight Forwarders Pvt. Ltd.', 'Seal Logistics')
content = content.replace('Seal Freight Logistics', 'Seal Logistics')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("PDFGenerator.jsx updated.")
