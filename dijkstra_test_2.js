const path = [
    [ 72.9354, 18.9388 ],
    [ 71, 18 ],
    [ 80, 5 ],
    [ 98, 5.5 ],
    [ 104.2, 1.3 ],
    [ 110, 10 ],
    [ 125, 15 ],
    [ -170, 40 ],
    [ -125, 35 ],
    [ -118.1937, 33.7701 ]
];

const allPoints = path.map(p => [...p]);

for (let i = 1; i < allPoints.length; i++) {
    let prev = allPoints[i-1];
    let curr = allPoints[i];
    while (curr[0] - prev[0] < -180) curr[0] += 360;
    while (curr[0] - prev[0] > 180) curr[0] -= 360;
}

console.log(allPoints);
