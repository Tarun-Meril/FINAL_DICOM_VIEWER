import { useState, useEffect, useCallback } from 'react';
import { Study, Series } from '../types';
import { apiClient } from '../api/client';

export interface FilterState {
  patientName: string;
  patientId: string;
  accessionNumber: string;
  modalities: string;
  studyDate: string;
  studyDescription: string;
}

export const useStudies = () => {
  const [studies, setStudies] = useState<Study[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    patientName: '',
    patientId: '',
    accessionNumber: '',
    modalities: '',
    studyDate: '',
    studyDescription: '',
  });

  const [selectedStudyUid, setSelectedStudyUid] = useState<string | null>(null);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);

  const fetchStudies = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });

      const res = await apiClient.get(`/api/studies?${queryParams.toString()}`);
      if (res.success) {
        setStudies(res.data);
      } else {
        throw new Error(res.message || 'Failed to fetch studies');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching studies');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  const fetchSeries = useCallback(async (studyInstanceUid: string) => {
    setIsLoadingSeries(true);
    try {
      const res = await apiClient.get(`/api/studies/${studyInstanceUid}/series`);
      if (res.success) {
        setSeriesList(res.data);
      } else {
        throw new Error(res.message || 'Failed to fetch series');
      }
    } catch (err: any) {
      console.error('Error fetching series:', err);
    } finally {
      setIsLoadingSeries(false);
    }
  }, []);

  const deleteStudy = useCallback(async (studyInstanceUid: string) => {
    try {
      const res = await apiClient.delete(`/api/studies/${studyInstanceUid}`);
      if (res.success) {
        setStudies(prev => prev.filter(s => s.studyInstanceUid !== studyInstanceUid));
        if (selectedStudyUid === studyInstanceUid) {
          setSelectedStudyUid(null);
          setSeriesList([]);
        }
      } else {
        throw new Error(res.message || 'Failed to delete study');
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  }, [selectedStudyUid]);

  const uploadDicomFiles = useCallback(async (files: File[]) => {
    setIsLoading(true);
    try {
      const res = await apiClient.upload('/api/studies/upload', files);
      if (res.success) {
        await fetchStudies();
        return res;
      } else {
        throw new Error(res.message || 'Upload failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchStudies]);

  // Fetch studies on filter change
  useEffect(() => {
    fetchStudies();
  }, [fetchStudies]);

  // Fetch series on selected study change
  useEffect(() => {
    if (selectedStudyUid) {
      fetchSeries(selectedStudyUid);
    } else {
      setSeriesList([]);
    }
  }, [selectedStudyUid, fetchSeries]);

  return {
    studies,
    isLoading,
    error,
    filters,
    setFilters,
    selectedStudyUid,
    setSelectedStudyUid,
    seriesList,
    isLoadingSeries,
    deleteStudy,
    uploadDicomFiles,
    refreshStudies: fetchStudies
  };
};
