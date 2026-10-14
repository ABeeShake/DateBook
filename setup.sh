
#!/usr/bin/env bash
set -euo pipefail

# Find the starter folder, regardless of where the script is run.
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$ROOT/datebook"

# Verify starter files exist.
if [[ ! -f "$ROOT/App.tsx" || ! -d "$ROOT/src" ]]; then
  echo "Error: App.tsx or src/ is missing from $ROOT." >&2
  exit 1
fi

# Create Expo project only if needed.
if [[ -f "$PROJECT/package.json" ]]; then
  echo "Existing Expo project found. Reusing it."
else
  if [[ -e "$PROJECT" ]]; then
    echo "Error: $PROJECT exists but has no package.json." >&2
    exit 1
  fi

  echo "Creating Expo project..."
  (
    cd "$ROOT"
    npx create-expo-app@latest datebook \
      --template blank-typescript
  )

  cp "$ROOT/App.tsx" "$PROJECT/App.tsx"
  cp -R "$ROOT/src" "$PROJECT/src"
fi

# Create .env.example if missing.
if [[ ! -f "$PROJECT/.env.example" ]]; then
  if [[ -f "$ROOT/.env.example" ]]; then
    cp "$ROOT/.env.example" "$PROJECT/.env.example"
  else
    cat > "$PROJECT/.env.example" <<'EOF'
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
EOF
  fi
fi

# Create .env without overwriting existing credentials.
if [[ ! -f "$PROJECT/.env" ]]; then
  cp "$PROJECT/.env.example" "$PROJECT/.env"
  echo "Created .env file."
else
  echo "Existing .env found. Keeping it."
fi

# Install required dependencies.
cd "$PROJECT"

npx expo install \
  @supabase/supabase-js \
  @react-native-async-storage/async-storage \
  react-native-url-polyfill \
  expo-clipboard

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit $PROJECT/.env with your Supabase credentials."
echo "2. Run:"
echo "   cd \"$PROJECT\""
echo "   npx expo start"
