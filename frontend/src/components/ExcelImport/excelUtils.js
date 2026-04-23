import * as XLSX from 'xlsx'

export function generateMonthlyTemplate(currentDate, users) {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const validUsers = users.filter(u => u.user_id && String(u.user_id).trim() !== '')

    const sortedUsers = [...validUsers].sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'producer' ? -1 : 1
        }
        return a.user_id.localeCompare(b.user_id, undefined, { numeric: true, sensitivity: 'base' })
    })

    const headers = ['Date', ...sortedUsers.map(u => u.user_id)]

    const rows = []
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const row = [dateStr]
        
        sortedUsers.forEach(() => row.push(''))
        rows.push(row)
    }

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

    const colWidths = [{ wch: 12 }] 
    sortedUsers.forEach(() => colWidths.push({ wch: 10 }))
    ws['!cols'] = colWidths

    const metaData = [
        ['Node ID', 'Type', 'Location Name'],
        ...sortedUsers.map(u => [u.user_id, u.type, u.location_name || u.user_id])
    ]
    const metaSheet = XLSX.utils.aoa_to_sheet(metaData)
    metaSheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 25 }]

    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Plan')
    XLSX.utils.book_append_sheet(wb, metaSheet, 'Node Registry')

    const monthName = currentDate.toLocaleString('default', { month: 'long' })
    const filename = `HMD_MonthlyPlan_${monthName}_${year}.xlsx`

    XLSX.writeFile(wb, filename)
}

export async function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result)
                const workbook = XLSX.read(data, { type: 'array', cellDates: true })

                const sheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[sheetName]

                const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })

                if (rawData.length < 2) {
                    reject(new Error('Excel file is empty or has no data rows'))
                    return
                }

                const headers = rawData[0]
                if (!headers || headers.length < 2) {
                    reject(new Error('Invalid header row. Expected: Date, Node1, Node2, ...'))
                    return
                }

                const dateColIndex = 0
                const nodeIds = headers.slice(1).filter(h => h && String(h).trim() !== '')

                const dates = []
                const gridData = {}

                for (let i = 1; i < rawData.length; i++) {
                    const row = rawData[i]
                    if (!row || row.length === 0) continue

                    let dateVal = row[dateColIndex]

                    let dateStr = ''
                    if (dateVal instanceof Date) {
                        dateStr = dateVal.toISOString().split('T')[0]
                    } else if (typeof dateVal === 'string') {
                        
                        dateStr = normalizeDate(dateVal)
                    } else if (typeof dateVal === 'number') {
                        
                        const excelDate = XLSX.SSF.parse_date_code(dateVal)
                        dateStr = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`
                    }

                    if (!dateStr) continue

                    dates.push(dateStr)
                    gridData[dateStr] = {}

                    nodeIds.forEach((nodeId, colIndex) => {
                        const cellValue = row[colIndex + 1]
                        gridData[dateStr][nodeId] = {
                            value: cellValue !== undefined && cellValue !== null && cellValue !== ''
                                ? String(cellValue).trim()
                                : '',
                            error: null
                        }
                    })
                }

                resolve({
                    dates,
                    nodes: nodeIds,
                    data: gridData
                })
            } catch (err) {
                reject(new Error(`Failed to parse Excel file: ${err.message}`))
            }
        }

        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsArrayBuffer(file)
    })
}

function normalizeDate(dateStr) {
    if (!dateStr) return ''

    const str = String(dateStr).trim()

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str
    }

    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(str)) {
        const parts = str.split(/[\/\-]/)
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    }

    if (/^\d{1,2}[\/]\d{1,2}[\/]\d{4}$/.test(str)) {
        const parts = str.split('/')
        
        if (parseInt(parts[0]) <= 12) {
            return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
        }
    }

    const parsed = new Date(str)
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0]
    }

    return str 
}

export function validateExcelData(parsedData, users, currentDate) {
    const errors = []
    const validNodeIds = new Set(users.map(u => u.user_id))
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1

    const unknownNodes = parsedData.nodes.filter(n => !validNodeIds.has(n))
    unknownNodes.forEach(node => {
        errors.push({
            type: 'column',
            node: node,
            message: `Unknown node ID: "${node}". This column will be skipped.`,
            severity: 'warning'
        })
    })

    parsedData.dates.forEach((dateStr, rowIndex) => {
        const rowNum = rowIndex + 2 

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            errors.push({
                type: 'date',
                row: rowNum,
                value: dateStr,
                message: `Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`,
                severity: 'error'
            })
            
            parsedData.nodes.forEach(nodeId => {
                if (parsedData.data[dateStr]?.[nodeId]) {
                    parsedData.data[dateStr][nodeId].error = 'Invalid date row'
                }
            })
            return
        }

        const [y, m, d] = dateStr.split('-').map(Number)

        const testDate = new Date(y, m - 1, d)
        if (testDate.getMonth() + 1 !== m || testDate.getDate() !== d) {
            errors.push({
                type: 'date',
                row: rowNum,
                value: dateStr,
                message: `Invalid date: "${dateStr}" does not exist.`,
                severity: 'error'
            })
            return
        }

        if (y !== year || m !== month) {
            errors.push({
                type: 'date',
                row: rowNum,
                value: dateStr,
                message: `Date ${dateStr} is outside the selected month (${year}-${String(month).padStart(2, '0')}).`,
                severity: 'warning'
            })
        }

        parsedData.nodes.forEach(nodeId => {
            if (!validNodeIds.has(nodeId)) return 

            const cell = parsedData.data[dateStr]?.[nodeId]
            if (!cell || cell.value === '' || cell.value === null || cell.value === undefined) {
                return 
            }

            const numValue = parseFloat(cell.value)

            if (isNaN(numValue)) {
                errors.push({
                    type: 'value',
                    row: rowNum,
                    col: nodeId,
                    value: cell.value,
                    message: `Invalid number: "${cell.value}"`,
                    severity: 'error'
                })
                cell.error = 'Invalid number'
            } else if (numValue < 0) {
                errors.push({
                    type: 'value',
                    row: rowNum,
                    col: nodeId,
                    value: cell.value,
                    message: 'Capacity cannot be negative',
                    severity: 'error'
                })
                cell.error = 'Negative value'
            } else if (numValue > 100000) {
                errors.push({
                    type: 'value',
                    row: rowNum,
                    col: nodeId,
                    value: cell.value,
                    message: 'Capacity exceeds maximum (100,000 MT)',
                    severity: 'error'
                })
                cell.error = 'Exceeds max'
            }
        })
    })

    return errors
}

export function transformToMonthlyDataFormat(parsedData, users) {
    const validNodeIds = new Set(users.map(u => u.user_id))
    const result = {}

    for (const dateStr of parsedData.dates) {
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue

        result[dateStr] = {}

        for (const nodeId of parsedData.nodes) {
            
            if (!validNodeIds.has(nodeId)) continue

            const cell = parsedData.data[dateStr]?.[nodeId]
            if (cell && cell.value !== '' && !cell.error) {
                const numValue = parseFloat(cell.value)
                if (!isNaN(numValue) && numValue >= 0) {
                    result[dateStr][nodeId] = numValue
                }
            }
        }
    }

    return result
}

export function getImportSummary(parsedData, errors, users) {
    const validNodeIds = new Set(users.map(u => u.user_id))
    const validNodes = parsedData.nodes.filter(n => validNodeIds.has(n))

    let totalCells = 0
    let filledCells = 0
    let errorCells = 0

    for (const dateStr of parsedData.dates) {
        for (const nodeId of validNodes) {
            totalCells++
            const cell = parsedData.data[dateStr]?.[nodeId]
            if (cell && cell.value !== '') {
                filledCells++
                if (cell.error) {
                    errorCells++
                }
            }
        }
    }

    const errorCount = errors.filter(e => e.severity === 'error').length
    const warningCount = errors.filter(e => e.severity === 'warning').length

    return {
        totalDays: parsedData.dates.length,
        validNodes: validNodes.length,
        totalNodes: parsedData.nodes.length,
        skippedNodes: parsedData.nodes.length - validNodes.length,
        totalCells,
        filledCells,
        errorCells,
        validCells: filledCells - errorCells,
        errorCount,
        warningCount,
        canImport: errorCount === 0
    }
}
