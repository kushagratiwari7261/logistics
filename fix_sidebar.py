filepath = 'src/components/Sidebar.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("style={ display: 'flex', alignItems: 'center' }", "style={{ display: 'flex', alignItems: 'center' }}")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Sidebar styling fixed.")
