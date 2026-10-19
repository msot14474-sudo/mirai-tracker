import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { academicApi } from './academic';
import { CampusAcademicOverview } from './CampusAcademicOverview';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('shows admin-created subjects even without offerings and exposes no setup writes', async () => {
  vi.spyOn(academicApi, 'campuses').mockResolvedValue([{id:'campus',name:'HI-Tech',code:'HT',timezone:'Asia/Kolkata'}]);
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([{id:'semester',campusId:'campus',name:'Semester 1',startDate:'2026-07-01',endDate:'2026-12-31',workingSaturdayRule:'SECOND_AND_FOURTH',status:'ACTIVE'}]);
  vi.spyOn(academicApi, 'subjects').mockResolvedValue([{id:'subject',name:'Web Development',code:'WD',description:null,active:true,offerings:[]}]);
  vi.spyOn(academicApi, 'semesterCourses').mockResolvedValue([]);
  vi.spyOn(academicApi, 'calendar').mockResolvedValue({semester:{} as any,days:[],exams:[],summary:{totalDays:0,workingDays:0,nonWorkingDays:0}});
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CampusAcademicOverview /></QueryClientProvider>);
  expect(await screen.findByRole('heading', {name:'Web Development'})).toBeInTheDocument();
  expect(await screen.findByRole('option',{name:/Semester 1/})).toBeInTheDocument();
  expect(screen.getByText(/program manager must link it/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/create|save|delete/i})).not.toBeInTheDocument();
  expect(academicApi.subjects).toHaveBeenCalledWith('campus');
});
