#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files that need to be updated
const filesToUpdate = [
  'src/app/dashboard/instances/create/page.tsx',
  'src/app/dashboard/bots/[id]/analytics/page.tsx',
  'src/app/dashboard/instances/[id]/page.tsx',
  'src/app/dashboard/bots/create/page.tsx',
  'src/app/dashboard/bots/[id]/page.tsx'
];

function updateFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Add import if not present
  if (!content.includes('useAuthToken')) {
    content = content.replace(
      /(import.*useToast.*from.*use-toast.*;)/,
      '$1\nimport { useAuthToken } from \'../../../hooks/useClientStorage\';'
    );
    
    // Handle different import patterns
    if (!content.includes('useAuthToken')) {
      content = content.replace(
        /(import.*from.*lucide-react.*;)/,
        '$1\nimport { useAuthToken } from \'@/hooks/useClientStorage\';'
      );
    }
  }
  
  // Replace localStorage.getItem('token') with token variable
  content = content.replace(/localStorage\.getItem\('token'\)/g, 'token');
  
  // Add token destructuring
  if (content.includes('const { toast } = useToast();') && !content.includes('useAuthToken()')) {
    content = content.replace(
      /const \{ toast \} = useToast\(\);/,
      'const { toast } = useToast();\n  const { token, isClient } = useAuthToken();'
    );
  }
  
  // Update useEffect patterns
  content = content.replace(
    /useEffect\(\(\) => \{\s*([^}]+)\(\);\s*\}, \[\]\);/g,
    'useEffect(() => {\n    if (isClient && token) {\n      $1();\n    }\n  }, [isClient, token]);\n\n  // Show loading state until client is ready\n  if (!isClient) {\n    return (\n      <div className="flex items-center justify-center min-h-[400px]">\n        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>\n      </div>\n    );\n  }'
  );
  
  fs.writeFileSync(fullPath, content);
  console.log(`Updated: ${filePath}`);
}

// Update all files
filesToUpdate.forEach(updateFile);

console.log('Hydration fixes applied to all files!');