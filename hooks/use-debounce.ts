'use client';

import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(handle);
  }, [delay, value]);

  return debouncedValue;
}
