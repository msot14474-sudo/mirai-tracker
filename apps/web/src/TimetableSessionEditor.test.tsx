import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {render, screen, fireEvent, waitFor, cleanup} from '@testing-library/react';
import {afterEach, it, expect, vi} from 'vitest';
import {TimetableSessionEditor} from './TimetableSessionEditor';
import {timetableApi, OfferingTimetable} from './timetable';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('updates only the chosen lecture using campus local time and refreshes dependent views', async()=>{
  const move = vi.spyOn(timetableApi, 'moveSession').mockResolvedValue({});
  const changed=vi.fn().mockResolvedValue(undefined), close=vi.fn();
  const detail={semester:{startDate:'2030-01-01',endDate:'2030-06-30', campus:{timezone:'Asia/Kolkata'}}} as OfferingTimetable;
  render(<QueryClientProvider client={new QueryClient()}><TimetableSessionEditor session={{id:'one-class',timetableEntryId:'weekly',sessionDate:'2030-01-07',startsAt:'2030-01-07T03:30:00Z',endsAt:'2030-01-07T04:30:00Z',plannedMinutes:60,status:'SCHEDULED'}} detail={detail} onChanged={changed} onClose={close}/></QueryClientProvider>);
  expect(screen.getByLabelText('New start time')).toHaveValue('09:00');
  fireEvent.change(screen.getByLabelText('New start time'),{target:{value:'11:00'}});
  fireEvent.change(screen.getByLabelText('New end time'),{target:{value:'12:00'}});
  fireEvent.change(screen.getByLabelText('Reason for change'),{target:{value:'Room change'}});
  fireEvent.click(screen.getByRole('button',{name:'Save this class only'}));
  await waitFor(()=>expect(move).toHaveBeenCalledWith('one-class',{date:'2030-01-07',startTime:'11:00',endTime:'12:00',reason:'Room change'}));
  expect(changed).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
});
