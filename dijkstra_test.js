const MARITIME_GRAPH = {
    nodes: {
        'MALACCA_W': [98.0, 5.5],
        'MALACCA_E': [104.2, 1.3],
        'HORMUZ': [56.5, 24.5],
        'BAB_EL_MANDEB': [43.3, 11.6],
        'SUEZ_S': [32.6, 29.9],
        'SUEZ_N': [32.3, 31.3],
        'GIBRALTAR': [-5.5, 35.9],
        'CAPE_GOOD_HOPE': [18.4, -34.4],
        'PANAMA_ATL': [-79.5, 9.4],
        'PANAMA_PAC': [-79.5, 8.9],
        'CAPE_HORN': [-67.3, -55.9],

        'MED_SEA': [15.0, 35.5],
        'RED_SEA_MID': [38.5, 20.0],
        'ARABIAN_SEA': [65.0, 15.0],
        'INDIAN_OCEAN': [75.0, -10.0],
        'SRI_LANKA_S': [80.0, 5.0],
        'BAY_OF_BENGAL': [88.0, 10.0],
        'PHILIPPINE_SEA': [125.0, 15.0],
        'PACIFIC_N': [-170.0, 40.0],
        'PACIFIC_S': [-140.0, -20.0],
        'ATLANTIC_N': [-35.0, 45.0],
        'ATLANTIC_S': [-20.0, -15.0],

        'INDIA_W': [71.0, 18.0],
        'INDIA_E': [82.0, 15.0],
        'MID_EAST': [52.0, 25.0],
        'EUROPE_N': [5.0, 50.0],
        'EUROPE_S': [10.0, 40.0],
        'US_EAST': [-75.0, 35.0],
        'US_WEST': [-125.0, 35.0],
        'SE_ASIA': [110.0, 10.0],
        'EAST_ASIA': [125.0, 30.0],
        'AFRICA_W': [-15.0, 0.0],
        'AFRICA_E': [45.0, -5.0]
    },
    edges: [
        ['MALACCA_W', 'MALACCA_E'],
        ['MALACCA_W', 'SRI_LANKA_S'],
        ['MALACCA_W', 'BAY_OF_BENGAL'],
        ['MALACCA_E', 'SE_ASIA'],
        ['SE_ASIA', 'PHILIPPINE_SEA'],
        ['SE_ASIA', 'EAST_ASIA'],
        ['PHILIPPINE_SEA', 'EAST_ASIA'],
        ['PHILIPPINE_SEA', 'PACIFIC_N'],
        ['PHILIPPINE_SEA', 'PACIFIC_S'],
        
        ['SRI_LANKA_S', 'INDIA_E'],
        ['SRI_LANKA_S', 'INDIA_W'],
        ['SRI_LANKA_S', 'INDIAN_OCEAN'],
        ['SRI_LANKA_S', 'ARABIAN_SEA'],
        ['BAY_OF_BENGAL', 'INDIA_E'],
        
        ['INDIA_W', 'ARABIAN_SEA'],
        ['ARABIAN_SEA', 'HORMUZ'],
        ['ARABIAN_SEA', 'BAB_EL_MANDEB'],
        ['ARABIAN_SEA', 'INDIAN_OCEAN'],
        ['HORMUZ', 'MID_EAST'],
        
        ['BAB_EL_MANDEB', 'RED_SEA_MID'],
        ['RED_SEA_MID', 'SUEZ_S'],
        ['SUEZ_S', 'SUEZ_N'],
        ['SUEZ_N', 'MED_SEA'],
        ['MED_SEA', 'EUROPE_S'],
        ['MED_SEA', 'GIBRALTAR'],
        
        ['GIBRALTAR', 'ATLANTIC_N'],
        ['GIBRALTAR', 'AFRICA_W'],
        ['GIBRALTAR', 'EUROPE_N'],
        
        ['ATLANTIC_N', 'EUROPE_N'],
        ['ATLANTIC_N', 'US_EAST'],
        ['ATLANTIC_N', 'PANAMA_ATL'],
        ['ATLANTIC_N', 'ATLANTIC_S'],
        
        ['ATLANTIC_S', 'AFRICA_W'],
        ['ATLANTIC_S', 'CAPE_GOOD_HOPE'],
        ['ATLANTIC_S', 'CAPE_HORN'],
        
        ['PANAMA_ATL', 'PANAMA_PAC'],
        ['PANAMA_ATL', 'US_EAST'],
        ['PANAMA_PAC', 'PACIFIC_N'],
        ['PANAMA_PAC', 'PACIFIC_S'],
        ['PANAMA_PAC', 'US_WEST'],
        
        ['PACIFIC_N', 'US_WEST'],
        ['PACIFIC_N', 'EAST_ASIA'],
        ['PACIFIC_S', 'CAPE_HORN'],
        
        ['INDIAN_OCEAN', 'CAPE_GOOD_HOPE'],
        ['INDIAN_OCEAN', 'AFRICA_E'],
        ['AFRICA_E', 'BAB_EL_MANDEB'],
        ['AFRICA_W', 'CAPE_GOOD_HOPE']
    ]
};

function distWrap(p1, p2) {
    let dx = p2[0] - p1[0];
    while (dx > 180) dx -= 360;
    while (dx < -180) dx += 360;
    const dy = p2[1] - p1[1];
    return Math.sqrt(dx*dx + dy*dy);
}

function getMaritimeRoute(origin, dest) {
    const nodes = Object.keys(MARITIME_GRAPH.nodes);
    let startNode = nodes[0], endNode = nodes[0];
    let minDistO = Infinity, minDistD = Infinity;

    nodes.forEach(n => {
        const coords = MARITIME_GRAPH.nodes[n];
        const doP = distWrap(origin, coords);
        if (doP < minDistO) { minDistO = doP; startNode = n; }
        const ddP = distWrap(dest, coords);
        if (ddP < minDistD) { minDistD = ddP; endNode = n; }
    });
    
    console.log("Start:", startNode, "End:", endNode);

    const adj = {};
    nodes.forEach(n => adj[n] = []);
    MARITIME_GRAPH.edges.forEach(([u, v]) => {
        const d = distWrap(MARITIME_GRAPH.nodes[u], MARITIME_GRAPH.nodes[v]);
        adj[u].push({ node: v, weight: d });
        adj[v].push({ node: u, weight: d });
    });

    const dists = {};
    const prev = {};
    const unvisited = new Set(nodes);
    
    nodes.forEach(n => { dists[n] = Infinity; prev[n] = null; });
    dists[startNode] = 0;

    while (unvisited.size > 0) {
        let u = null;
        for (const n of unvisited) {
            if (u === null || dists[n] < dists[u]) u = n;
        }
        
        if (dists[u] === Infinity || u === endNode) break;
        unvisited.delete(u);

        for (const neighbor of adj[u]) {
            const alt = dists[u] + neighbor.weight;
            if (alt < dists[neighbor.node]) {
                dists[neighbor.node] = alt;
                prev[neighbor.node] = u;
            }
        }
    }

    const path = [];
    let curr = endNode;
    while (curr) {
        path.unshift(curr);
        curr = prev[curr];
    }
    
    return path;
}

const origin = [72.935, 18.938];
const dest = [-118.19, 33.77];
console.log(getMaritimeRoute(origin, dest));
