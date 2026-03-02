"""Entry point for python -m raccoon_runtime."""

import sys
from pathlib import Path

# The generated protobuf code imports `from raccoon.agent.v1 import ...`
# which needs the `generated` directory on sys.path.
_generated = str(Path(__file__).parent / "generated")
if _generated not in sys.path:
    sys.path.insert(0, _generated)

from raccoon_runtime.server import main

main()
