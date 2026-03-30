import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StatusTimeline from './src/components/StatusTimeline.jsx';
import { STATUS_STEPS } from './src/constants/shipment.js';

const html = renderToStaticMarkup(React.createElement(StatusTimeline, { currentStatus: 'At Port', updates: [] }));
console.log("----- HTML OUTPUT -----");
console.log(html);
