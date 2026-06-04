import re
import os

filepath = 'src/components/NewShipments.jsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Add Shipment button onClick
content = content.replace("onClick={() => setShowShipmentForm(true)}", "onClick={() => window.dispatchEvent(new CustomEvent('open_global_shipment_form'))}")

# Replace Edit Shipment onClick. In handleEditShipment or just replace the function body
edit_function_pattern = r"const handleEditShipment = \(shipment\) => \{.*?setEditingShipment\(shipment\);\s*setShowShipmentForm\(true\);\s*\};"
new_edit_function = """const handleEditShipment = (shipment) => {
    window.dispatchEvent(new CustomEvent('open_global_shipment_form', { detail: shipment }));
  };"""
content = re.sub(edit_function_pattern, new_edit_function, content, flags=re.DOTALL)

# Now we need to remove the rendering of {showShipmentForm && ( <div className="modal-overlay"> ... )}
# To do this safely, we can replace the entire `return (` statement down to the bottom.
# Let's find `<div className="new-shipment-container">`
# Wait, NewShipments.jsx returns:
# return (
#   <div className="new-shipment-container">
#     <div className="new-shipment-header-top">
#        ...
#     {showShipmentForm && (
#       ...
#     )}
#   </div>
# );

# Let's remove the modal overlay using regex.
modal_overlay_pattern = r"\{showShipmentForm && \(\s*<div className=\"modal-overlay\">.*?</>.*?</div>\s*\)\s*\}"
# Wait, the modal contains thousands of lines of code. It's safer to find `{showShipmentForm && (` and matching braces, but regex can't do balanced braces easily.
# Alternative: we already know everything after `{showShipmentForm && (` until the last `</div>\n  );\n};` is the modal and the closing tags.

def remove_modal(text):
    start_str = "{showShipmentForm && ("
    start_idx = text.find(start_str)
    if start_idx == -1:
        return text
    
    # We want to replace everything from start_str to the end, with `</div>\n  );\n};`
    end_replacement = "</div>\n  );\n};\n\nexport default NewShipments;\n"
    
    # First, let's find the closing `</div>` of `new-shipment-container`
    # We can just cut off at start_idx and append the closing tags.
    new_text = text[:start_idx] + end_replacement
    return new_text

content = remove_modal(content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done stripping NewShipments.jsx")
