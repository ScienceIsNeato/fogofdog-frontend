const fs = require('fs');

const filePath = 'src/components/SimplePerformancePanel.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace literal \n with actual newline
content = content.replace('radiusKm: 5,\\n        sessionDurationHours: 2', 'radiusKm: 5,\n        sessionDurationHours: 2');

fs.writeFileSync(filePath, content);
console.log('Fixed literal \\n in SimplePerformancePanel.tsx');
