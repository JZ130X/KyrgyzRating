import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import { FAVICON_URL } from './brand.js';

// значок вкладки браузера = логотип программы
try { const l = document.querySelector("link[rel='icon']"); if (l) { l.href = FAVICON_URL; l.type = 'image/png'; } } catch (e) { /* */ }

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
          <h2>Ошибка интерфейса</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.err && this.state.err.stack || this.state.err)}</pre>
          <button onClick={() => { try { localStorage.removeItem('kyrgyz-rating-form-v2'); } catch (e) { /* */ } location.reload(); }}>Сбросить сохранённые данные и перезагрузить</button>
        </div>
      );
    }
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>);
