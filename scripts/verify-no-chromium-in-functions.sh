#!/bin/bash
# Verify that Chromium is NOT bundled in Vercel serverless functions
# Run this after `next build` to check function sizes

set -e

echo "🔍 Checking Vercel function bundles for Chromium/Playwright..."
echo ""

if [ ! -d ".next" ]; then
    echo "❌ .next directory not found. Run 'npm run build' first."
    exit 1
fi

# Check if any serverless functions contain chromium or playwright
echo "Searching for chromium/playwright in .next/server..."
if find .next/server -type f -name "*.js" | xargs grep -l "chromium\|playwright" 2>/dev/null | head -5; then
    echo ""
    echo "⚠️  WARNING: Found chromium/playwright references in server bundles!"
    echo "This means the fix may not be working correctly."
    exit 1
else
    echo "✅ No chromium/playwright found in server bundles (good!)"
fi

echo ""
echo "📦 Checking function sizes in .next/server/app/api..."
if [ -d ".next/server/app/api" ]; then
    du -sh .next/server/app/api/* 2>/dev/null | head -20
    echo ""
    
    # Calculate total size
    total_kb=$(du -sk .next/server/app/api | awk '{print $1}')
    total_mb=$((total_kb / 1024))
    
    echo "Total API routes size: ~${total_mb} MB"
    
    if [ $total_mb -gt 100 ]; then
        echo "⚠️  WARNING: API routes are very large (>100 MB). Expected <50 MB."
    else
        echo "✅ API routes size looks reasonable."
    fi
else
    echo "ℹ️  No .next/server/app/api directory found"
fi

echo ""
echo "✅ Verification complete!"
echo ""
echo "Expected results after fix:"
echo "  - No chromium/playwright in server bundles: ✅"
echo "  - Total API routes <50 MB: ✅"
echo "  - Individual API route chunks <5 MB: ✅"
