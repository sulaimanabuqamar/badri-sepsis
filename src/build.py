# Builds ../index.html from the source files in this folder.
# Run from anywhere:  python3 src/build.py
import pathlib
src = pathlib.Path(__file__).resolve().parent
root = src.parent
html = (src/'app.html').read_text()
eng = (src/'engine.js').read_text()
app = (src/'world.js').read_text() + '\n' + (src/'avatars.js').read_text() + '\n' + (src/'ui.js').read_text()
assert '/*__ENGINE__*/' in html and '/*__APP__*/' in html
out = html.replace('/*__ENGINE__*/', eng).replace('/*__APP__*/', app)
(root/'index.html').write_text(out)
print('built index.html,', len(out), 'bytes')
