import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BatchTimetableGrid } from './BatchTimetableGrid';
afterEach(cleanup);
it('puts every subject in its weekday and time and opens the correct class', () => {
  const edit = vi.fn();
  const entry = {id:'monday', facultyAssignmentId:null, facultyName:'Asha', weekday:1, startTime:'09:00', endTime:'10:00', plannedMinutes:60, effectiveFrom:'2030-01-01',effectiveTo:'2030-06-30',active:true};
  const base = {batch:{id:'batch',name:'First Year A',code:'A'}, targetFinishDate:'2030-06-30',weeklyPlannedMinutes:60,generatedSessions:20};
  render(<BatchTimetableGrid onEdit={edit} offerings={[
    {...base, id:'dsa', subject:{id:'dsa', name:'Data Structures',code:'DSA'}, entries:[entry]},
    {...base, id:'web', subject:{id:'web',name:'Web Development',code:'WEB'}, entries:[{...entry,id:'tuesday',weekday:2}]},
  ]}/>);
  expect(screen.getByRole('columnheader',{name:'Monday'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Edit Web Development, Tuesday 09:00–10:00'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Edit Data Structures, Monday 09:00–10:00'}));
  expect(edit).toHaveBeenCalledWith('dsa',entry);
});
