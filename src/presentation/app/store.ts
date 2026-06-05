import { draftReducer } from '@presentation/draft/slice';
import { libraryReducer } from '@presentation/library/slice';
import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

// Composition root for renderer state. Adding new domains later means slotting
// another reducer in here — keeping the file flat lets us see the entire shape
// of UI state at a glance.
export const store = configureStore({
  reducer: {
    draft: draftReducer,
    library: libraryReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
