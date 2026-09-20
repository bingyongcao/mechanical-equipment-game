"""Render the truck crane using the shared excavator studio preset."""
import runpy
from pathlib import Path

namespace = runpy.run_path(str(Path(__file__).with_name('render_machine_thumbnails.py')))
namespace['render_thumbnail']('truck-crane')
