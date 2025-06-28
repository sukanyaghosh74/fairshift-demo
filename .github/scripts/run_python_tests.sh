# Expects the following environment variables to be set:
#     $TIMEFOLD_SOLVER_PYTHON_DIST    (Example: "/timefold-solver-python/dist")
cd python || exit 1
for d in */;
do
    if [ -f "$d/pyproject.toml" ]; then
      cd "$d" || exit 1
      if [ -d ".venv" ]; then
          rm -rf .venv
      fi
      python -m venv .venv
      . .venv/bin/activate
      pip install --find-links "$TIMEFOLD_SOLVER_PYTHON_DIST" . || exit 1
      pytest || exit 1
      deactivate
      cd .. || exit 1
    fi
done