const fs = require('fs');
const path = require('path');

const fileReplacements = [
  {
    file: 'src/App.jsx',
    replace: [
      {
        from: /<img\s+src=\{sealLogo\}\s+alt="SUNEX International"\s+className="loading-logo-img"\s*\/>/g,
        to: '<span style={{ fontSize: \'2rem\', fontWeight: \'bold\', color: \'#4f46e5\', marginBottom: \'20px\' }}>SUNEX International</span>'
      }
    ]
  },
  {
    file: 'src/components/Register.jsx',
    replace: [
      {
        from: /<img\s+src=\{sealLogo\}\s+alt="SUNEX International"\s+className="register-logo-img"\s*\/>/g,
        to: ''
      }
    ]
  },
  {
    file: 'src/components/ForgotPassword.jsx',
    replace: [
      {
        from: /<img\s+src=\{sealLogo\}\s+alt="SUNEX International"\s+className="login-logo-img"\s*\/>/g,
        to: ''
      }
    ]
  },
  {
    file: 'src/components/ResetPassword.jsx',
    replace: [
      {
        from: /<img\s+src=\{sealLogo\}[\s\S]*?alt="SUNEX International Logo"[\s\S]*?\/>/g,
        to: ''
      }
    ]
  }
];

fileReplacements.forEach(({ file, replace }) => {
  const p = path.join(__dirname, file);
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    let newContent = content;
    replace.forEach(({ from, to }) => {
      newContent = newContent.replace(from, to);
    });
    if (content !== newContent) {
      fs.writeFileSync(p, newContent);
      console.log(`Updated ${p}`);
    }
  }
});
