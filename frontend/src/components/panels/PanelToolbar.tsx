import React from 'react';
import { LayoutType } from '../../types/panel.types';

interface PanelToolbarProps {
  onAddPanel: () => void;
  onLayoutChange: (layout: LayoutType) => void;
  currentLayout: LayoutType;
  panelCount: number;
  maxPanels?: number;
}

const PanelToolbar: React.FC<PanelToolbarProps> = ({
  onAddPanel,
  onLayoutChange,
  currentLayout,
  panelCount,
  maxPanels = 4,
}) => {
  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#252525',
    borderBottom: '1px solid #444',
    gap: '12px',
    flexWrap: 'wrap',
  };

  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 600,
    color: '#e0e0e0',
    margin: 0,
  };

  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid #555',
    borderRadius: '4px',
    backgroundColor: '#007bff',
    color: '#fff',
    cursor: panelCount >= maxPanels ? 'not-allowed' : 'pointer',
    opacity: panelCount >= maxPanels ? 0.5 : 1,
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  const selectStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '13px',
    border: '1px solid #555',
    borderRadius: '4px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    cursor: 'pointer',
    outline: 'none',
  };

  return (
    <div style={toolbarStyle}>
      <div style={sectionStyle}>
        <h3 style={titleStyle}>Log Panels</h3>
        <span style={{ fontSize: '12px', color: '#888' }}>
          {panelCount} / {maxPanels} panels
        </span>
      </div>

      <div style={sectionStyle}>
        <button
          onClick={onAddPanel}
          disabled={panelCount >= maxPanels}
          style={buttonStyle}
          title={panelCount >= maxPanels ? `Maximum ${maxPanels} panels` : 'Add new panel'}
          onMouseEnter={(e) => {
            if (panelCount < maxPanels) {
              e.currentTarget.style.backgroundColor = '#0056b3';
            }
          }}
          onMouseLeave={(e) => {
            if (panelCount < maxPanels) {
              e.currentTarget.style.backgroundColor = '#007bff';
            }
          }}
        >
          <span style={{ fontSize: '16px' }}>+</span>
          Add Panel
        </button>

        <select
          value={currentLayout}
          onChange={(e) => onLayoutChange(e.target.value as LayoutType)}
          style={selectStyle}
          title="Choose panel layout"
        >
          <option value="single">Single</option>
          <option value="horizontal">Horizontal Split</option>
          <option value="vertical">Vertical Split</option>
          <option value="quad">Quad Grid</option>
          <option value="main-sidebar">Main + Sidebar</option>
        </select>
      </div>
    </div>
  );
};

export default PanelToolbar;
