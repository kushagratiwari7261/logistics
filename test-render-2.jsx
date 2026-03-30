import React from 'react';
import { renderToString } from 'react-dom/server';
import { FileText } from 'lucide-react';

const html = renderToString(React.createElement('div', null, React.createElement(FileText, { size: 16 }), 0 < 5 && React.createElement('span', null, 'test')));
console.log(html);
