#!/bin/bash
# Build landing page and integrate into Next.js app

set -e

if [ "${INTEGRATE_LEGACY_VITE_LANDING}" != "true" ]; then
  echo "Landing integration skipped. Set INTEGRATE_LEGACY_VITE_LANDING=true to run."
  exit 0
fi

echo "🚀 Building landing page..."
cd landing-page
npm install
npm run build

echo "📁 Creating public folder in tutorme-app..."
cd ../tutorme-app
mkdir -p public

echo "📝 Copying built landing page to public folder..."
cp -r ../landing-page/dist/* public/

echo "✅ Landing page integrated!"
echo ""
echo "Next steps:"
echo "1. Start your Next.js app: cd tutorme-app && npm run dev"
echo "2. Visit http://localhost:3003"
echo ""
echo "To deploy:"
echo "- Build production: cd tutorme-app && npm run build"
echo "- Ensure your root landing is wired in Next.js routing"
