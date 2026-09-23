import React from 'react';
import { Search } from 'lucide-react';
import { FilterState } from '../hooks/useStudies';

interface SearchFiltersProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({ filters, setFilters }) => {
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Split date range into start and end for the UI inputs
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    if (start && end) {
      setFilters(prev => ({ ...prev, studyDate: `${start.replace(/-/g, '')}-${end.replace(/-/g, '')}` }));
    } else if (start) {
      setFilters(prev => ({ ...prev, studyDate: start.replace(/-/g, '') }));
    } else {
      setFilters(prev => ({ ...prev, studyDate: '' }));
    }
  };

  React.useEffect(() => {
    if (!filters.studyDate) {
      setStartDate('');
      setEndDate('');
    }
  }, [filters.studyDate]);

  return (
    <div className="filter-card">
      {/* Row 1 */}
      <div className="filter-row filter-row-1">
        {/* General Search */}
        <div className="filter-group">
          <div className="input-container">
            <Search size={16} />
            <input
              type="text"
              name="patientName" // We'll map this to patientName search
              placeholder="Search Name, MRN, Acc, Inst..."
              className="form-input form-input-icon"
              value={filters.patientName}
              onChange={handleInputChange}
            />
          </div>
        </div>

        {/* MRN */}
        <div className="filter-group">
          <input
            type="text"
            name="patientId"
            placeholder="MRN"
            className="form-input"
            value={filters.patientId}
            onChange={handleInputChange}
          />
        </div>

        {/* Patient Name */}
        <div className="filter-group">
          <input
            type="text"
            name="patientName"
            placeholder="Patient Name"
            className="form-input"
            value={filters.patientName}
            onChange={handleInputChange}
          />
        </div>

        {/* Modality Dropdown */}
        <div className="filter-group">
          <select
            name="modalities"
            className="form-select"
            value={filters.modalities}
            onChange={handleInputChange}
          >
            <option value="">Modality</option>
            <option value="CT">CT</option>
            <option value="MR">MR</option>
            <option value="PT">PT</option>
            <option value="CR">CR</option>
            <option value="DX">DX</option>
            <option value="US">US</option>
          </select>
        </div>

        {/* Date Range Picker */}
        <div className="filter-group">
          <div className="date-range-container">
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginRight: '4px' }}>DATE</span>
            <input
              type="date"
              className="date-range-input"
              value={startDate}
              onChange={(e) => handleDateChange(e.target.value, endDate)}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>to</span>
            <input
              type="date"
              className="date-range-input"
              value={endDate}
              onChange={(e) => handleDateChange(startDate, e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Row 2 */}
      <div className="filter-row filter-row-2">
        {/* Institution */}
        <div className="filter-group">
          <input
            type="text"
            name="studyDescription" // Map to description for demo
            placeholder="Institution"
            className="form-input"
            value={filters.studyDescription}
            onChange={handleInputChange}
          />
        </div>

        {/* Accession # */}
        <div className="filter-group">
          <input
            type="text"
            name="accessionNumber"
            placeholder="Accession #"
            className="form-input"
            value={filters.accessionNumber}
            onChange={handleInputChange}
          />
        </div>

        {/* Status Dropdown */}
        <div className="filter-group">
          <select
            className="form-select"
            defaultValue=""
          >
            <option value="">Status</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
        </div>
      </div>
    </div>
  );
};
export default SearchFilters;
