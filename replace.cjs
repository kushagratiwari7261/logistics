const fs = require('fs');
const path = require('path');

const dirs = ['src', 'backend', 'public', '.'];
const excludeFiles = ['node_modules', '.git', 'package-lock.json', 'seal.png', 'image.png'];

function walkAndReplace(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (excludeFiles.includes(file)) continue;
        
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkAndReplace(fullPath);
        } else {
            if (['.js', '.jsx', '.html', '.css', '.json', '.md'].includes(path.extname(fullPath)) || file === 'vite.config.js') {
                let content = fs.readFileSync(fullPath, 'utf8');
                let newContent = content;
                
                // Replace Seal Freight to SUNEX International
                newContent = newContent.replace(/Seal Freight/g, 'SUNEX International');
                newContent = newContent.replace(/seal-freight/g, 'sunex-international');
                newContent = newContent.replace(/sealfreight/g, 'sunexinternational');
                newContent = newContent.replace(/SealFreight/g, 'SUNEXInternational');
                
                if (content !== newContent) {
                    fs.writeFileSync(fullPath, newContent);
                    console.log(`Updated ${fullPath}`);
                }
            }
        }
    }
}

walkAndReplace('src');
walkAndReplace('backend');
walkAndReplace('public');
// Also root files
['vite.config.js', 'index.html'].forEach(f => {
    let p = path.join(__dirname, f);
    if(fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        let newContent = content.replace(/Seal Freight/g, 'SUNEX International')
                                .replace(/seal-freight/g, 'sunex-international')
                                .replace(/sealfreight/g, 'sunexinternational')
                                .replace(/SealFreight/g, 'SUNEXInternational');
        if (content !== newContent) {
            fs.writeFileSync(p, newContent);
            console.log(`Updated ${p}`);
        }
    }
});
