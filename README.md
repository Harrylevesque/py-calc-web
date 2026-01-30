# Math Code Editor (Flask)

A dark-mode Flask app that evaluates Python math code line by line and updates all lines below the one you changed.

## Features
- Line-by-line evaluation with cascading updates.
- Dark mode editor UI with line numbers and result column.
- Built-in access to common math libraries (math, cmath, statistics, random, decimal, fractions, numpy, scipy, sympy, mpmath).
- Function searcher with direct links to official documentation.

## Run
1. Install dependencies from requirements.txt.
2. Start the server with python app.py.
3. Open http://localhost:5000.

## Notes
- Use expressions (e.g., 2 + 2) or assignments (e.g., x = 10).
- Results appear to the right of each line.
