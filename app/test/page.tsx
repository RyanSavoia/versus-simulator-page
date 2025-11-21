'use client';

export default function TestPage() {
  console.log('Test page rendering');
  
  return (
    <div style={{ 
      padding: '50px',
      background: '#000',
      color: '#fff',
      fontSize: '24px'
    }}>
      <h1>Test Page Works!</h1>
      <p>If you see this, the app is loading correctly.</p>
      <p>Check the console - you should see "Test page rendering"</p>
    </div>
  );
}

