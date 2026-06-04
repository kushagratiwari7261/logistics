import re

filepath = 'src/App.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("import GlobalJobForm from './components/GlobalJobForm'", "import GlobalJobForm from './components/GlobalJobForm'\nimport GlobalShipmentForm from './components/GlobalShipmentForm'")

content = content.replace("{isAuthenticated && <GlobalJobForm />}", "{isAuthenticated && <GlobalJobForm />}\n              {isAuthenticated && <GlobalShipmentForm />}")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
