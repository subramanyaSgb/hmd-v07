import { useState, useMemo } from 'react';

export const useTableSort = (data = [], initialConfig = { key: null, direction: 'asc' }) => {
    const [sortConfig, setSortConfig] = useState(initialConfig);

    const sortedData = useMemo(() => {
        let sortableItems = [...data];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;

                if (typeof aValue === 'string') {
                    return sortConfig.direction === 'asc'
                        ? aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' })
                        : bValue.localeCompare(aValue, undefined, { numeric: true, sensitivity: 'base' });
                }

                if (sortConfig.direction === 'asc') {
                    return aValue > bValue ? 1 : -1;
                } else {
                    return aValue < bValue ? 1 : -1;
                }
            });
        }
        return sortableItems;
    }, [data, sortConfig]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    return { items: sortedData, requestSort, sortConfig };
};
