"""Publish the supplied archive and add its card to the public works page."""
from pathlib import Path
import hashlib
import shutil

root = Path(__file__).resolve().parents[1]
source = Path('C:/Users/egiby/Documents/Codex/2026-10-03/new-chat/work/class/downloads/ai/EpicPen-Windows-x64.zip')
target = root / 'downloads/EpicPen-Windows-x64.zip'
target.parent.mkdir(exist_ok=True)
shutil.copyfile(source, target)
assert hashlib.sha256(source.read_bytes()).digest() == hashlib.sha256(target.read_bytes()).digest()
page = root / 'index.html'
text = page.read_text(encoding='utf-8')
section = '''
  <section data-page="works" class="home-section page-list" aria-labelledby="pcAppsTitle" id="pc-applications"><div class="section-heading"><div><p class="home-eyebrow">수업에 사용하는 도구</p><h2 id="pcAppsTitle">PC 응용프로그램</h2></div><p>컴퓨터에서 사용하는 수업 보조 프로그램을 내려받아요.</p></div><div class="public-gallery-grid"><article class="gallery-card"><div class="gallery-cover" data-kind="zip" aria-hidden="true"><span class="gallery-symbol">✎</span><span class="gallery-cover-label">PC 응용프로그램</span></div><div class="gallery-body"><span class="gallery-kind">윈도우 64비트 · 화면 필기</span><h3>에픽펜</h3><p class="gallery-description">화면 위에 글씨와 그림을 그려 중요한 부분을 표시하는 도구예요.</p><p class="gallery-file-status">ZIP 62.4 MB · 파일 7개 포함<br>압축을 모두 푼 뒤 폴더 안의 EpicPen.exe를 실행하세요. 함께 들어 있는 파일은 같은 폴더에 두세요.</p><a class="gallery-open" href="downloads/EpicPen-Windows-x64.zip" download>에픽펜 전체 파일 내려받기 ↓</a></div></article></div></section>
'''
if 'id="pc-applications"' not in text:
    start = text.index('<section data-page="works"')
    end = text.index('</section>', start) + len('</section>')
    text = text[:end] + section + text[end:]
page.write_text(text, encoding='utf-8', newline='\n')
print('Public EpicPen card and archive ready; original archive SHA256 matches.')
