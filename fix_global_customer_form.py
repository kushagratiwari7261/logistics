import re

with open('d:\\noida-main\\src\\components\\CustomerPage.jsx', 'r') as f:
    customer_page = f.read()

# Extract the modal code from CustomerPage.jsx
modal_match = re.search(r'\{/\* Add/Edit Modal \*/\}.*?\{showModal && \(\s*(<div className="modal-overlay">.*?)      \)\}', customer_page, re.DOTALL)
if not modal_match:
    print("Could not find modal in CustomerPage")
    exit(1)

modal_jsx = modal_match.group(1)

# Now generate GlobalCustomerForm.jsx
with open('d:\\noida-main\\src\\components\\GlobalCustomerForm.jsx', 'r') as f:
    global_form = f.read()

# Make sure we add back the header with minimize and close buttons!
header_replacement = """<div className="modal-overlay">
                      <div className="modal large-modal" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                          <h2 style={{ margin: 0 }}>{editingCustomer ? `Edit ${displayType}` : `Add New ${displayType}`}</h2>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => onMinimize(id)}
                              title="Minimize"
                              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
                            >
                              <Minus size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onClose(id)}
                              title="Close"
                              style={{ background: '#e74c3c', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center' }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
"""

# Find the form inside the extracted JSX
form_match = re.search(r'(<form onSubmit=\{handleSave\} className="vendor-form">.*?</form>)', modal_jsx, re.DOTALL)
if not form_match:
    print("Could not find form in modal")
    exit(1)

form_jsx = form_match.group(1)

# Replace the button handlers in the form_jsx
form_jsx = re.sub(r'onClick=\{\(\) => \{ setShowModal\(false\); setEditingCustomer\(null\); \}\}', 'onClick={() => onClose(id)}', form_jsx)

# Combine the header, the form, and the closing divs
new_modal_jsx = header_replacement + form_jsx + "\n                        </div>\n                      </div>\n                    </div>"

# Replace the return statement of CustomerFormWindow
new_global_form = re.sub(r'return \(\s*<div className="modal-overlay">.*?\);\s*};\s*const GlobalCustomerForm', 
    'return (\n' + new_modal_jsx + '\n  );\n};\n\nconst GlobalCustomerForm', 
    global_form, flags=re.DOTALL)

with open('d:\\noida-main\\src\\components\\GlobalCustomerForm.jsx', 'w') as f:
    f.write(new_global_form)

print("Fixed GlobalCustomerForm.jsx")
