import React from 'react';
import { renderToString } from 'react-dom/server';
import { STATUS_STEPS } from './src/constants/shipment.js';
import StatusTimeline from './src/components/StatusTimeline.jsx';

const html = renderToString(React.createElement(StatusTimeline, { currentStatus: 'At Port', updates: [] }));
console.log(html);
