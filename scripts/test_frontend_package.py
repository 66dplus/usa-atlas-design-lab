"""Compiled entry assets must be in the exact public package mapping."""
from pathlib import Path
import tempfile
import unittest
from scripts.build_temporary_preview import validate_entry_assets, PUBLIC


class FrontendPackageTests(unittest.TestCase):
    def test_editor_stylesheet_is_an_explicit_runtime_asset(self):
        self.assertIn('ux/studio.css', PUBLIC)

    def test_relative_scripts_styles_and_fonts_must_be_mapped(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'ux').mkdir()
            (root / 'ux/index.html').write_text('<link rel="stylesheet" href="app.css?v=1"><script src="app.js"></script>')
            (root / 'ux/app.css').write_text('@font-face {src: url("font.ttf")}')
            (root / 'ux/app.js').write_text('/* compiled */')
            (root / 'ux/font.ttf').write_bytes(b'fixture')
            manifest = {'/' + name: name for name in ('ux/index.html', 'ux/app.css', 'ux/app.js', 'ux/font.ttf')}
            manifest['/ux/'] = 'ux/index.html'
            validate_entry_assets(root, manifest)
            for name in ('ux/app.css', 'ux/app.js', 'ux/font.ttf'):
                missing = dict(manifest)
                del missing['/' + name]
                with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Unmapped entry asset'):
                    validate_entry_assets(root, missing)

    def test_unreviewed_remote_entry_assets_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'index.html').write_text('<script src="https://unreviewed.invalid/app.js"></script>')
            with self.assertRaisesRegex(ValueError, 'Unmapped entry asset'):
                validate_entry_assets(root, {'/': 'index.html'})

    def test_inline_data_assets_do_not_require_a_public_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'app.css').write_text('a{background:url(data:image/png;base64,fixture)}')
            validate_entry_assets(root, {'/app.css': 'app.css'})
