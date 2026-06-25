const https = require('https');
const fs = require('fs');

const url = 'https://raw.githubusercontent.com/amcharts/svg-maps/master/svg/worldLow.svg';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      data = data.replace(/fill="[^"]*"/g, 'fill="#E8E4F5"');
      data = data.replace(/<path /g, '<path stroke="#C8BEE8" stroke-width="0.8" ');
      fs.writeFileSync('d:/noida-main/public/stitch-world-map.svg', data);
      console.log('Successfully created detailed map with your exact colors!');
    } else {
      console.error('Failed to download map:', res.statusCode);
    }
  });
}).on('error', err => console.error(err.message));
