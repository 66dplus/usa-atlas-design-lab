import { createRoot } from 'react-dom/client';
import { useStudio } from './use-studio';
import { StudioView } from './studio-view';
function AdvertiserStudio() {
  const studio = useStudio();
  return (
    <div style={{ display: 'contents' }} onClick={studio.onClick} onKeyDown={studio.onKeyDown}>
      <StudioView studio={studio} />
    </div>
  );
}
createRoot(document.getElementById('studio-root')!).render(<AdvertiserStudio />);
