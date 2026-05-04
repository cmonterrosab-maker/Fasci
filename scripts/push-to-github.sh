#!/bin/bash
# scripts/push-to-github.sh
# Sube el proyecto Droguería Virtual a GitHub.
# Uso: bash scripts/push-to-github.sh <github-username> <repo-name>
# Ejemplo: bash scripts/push-to-github.sh tu-usuario drogueria-virtual

set -e

if [ "$#" -lt 2 ]; then
  echo "Uso: bash scripts/push-to-github.sh <github-username> <repo-name>"
  echo "Ejemplo: bash scripts/push-to-github.sh tu-usuario drogueria-virtual"
  exit 1
fi

USERNAME=$1
REPO=$2

cd "$(dirname "$0")/.."

echo "🔧 Inicializando git..."
git init -b main 2>/dev/null || git checkout -B main

echo ""
echo "🔧 Configurando usuario..."
git config user.email "cmonterrosab@promidamos.org"
git config user.name "C. Andres"

echo ""
echo "📦 Agregando archivos (respetando .gitignore)..."
git add .

echo ""
echo "🔍 Verificando que NO se cuelen secrets..."
if git status --porcelain | grep -E "(^A|\?\?) +\.env$|(^A|\?\?) +\.env\.local"; then
  echo "❌ DETENIDO: Hay archivos .env con secrets reales que están por subirse."
  echo "   Verifica tu .gitignore antes de continuar."
  exit 1
fi
echo "✅ OK: solo .env.example está incluido (es seguro)"

echo ""
echo "💾 Creando commit inicial..."
git commit -m "feat: Droguería Virtual v1.0 — bot WhatsApp B2C+B2B con asignación turbo y fee" || echo "(ya existía un commit)"

echo ""
echo "🔗 Conectando con GitHub..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$USERNAME/$REPO.git"

echo ""
echo "🚀 Subiendo a GitHub..."
echo "   Si el repo aún no existe, créalo primero en:"
echo "   https://github.com/new"
echo ""
echo "   Luego ejecuta:"
echo "   git push -u origin main"
echo ""
echo "✅ Todo listo localmente. Solo falta hacer git push -u origin main"
