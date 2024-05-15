import {app, input, output, InvocationContext, Timer} from "@azure/functions";

const key = process.env['AUTOMOWER_APPLICATION_KEY']
const secret = process.env['AUTOMOWER_APPLICATION_SECRET']
const mowerId = process.env['AUTOMOWER_MOWER_ID']
const authEndpoint = 'https://api.authentication.husqvarnagroup.dev/v1/oauth2/token'
const endpoint = 'https://api.amc.husqvarna.dev/v1'
const frequencyMinutes = 10

interface AutomowerPosition {
	PartitionKey: string
	RowKey: string
	latitude: number
	longitude: number
}

interface Position {
	latitude: number
	longitude: number
}

interface MowerDataData {
	type: string
	id: string
	attributes: {
		system: any
		battery: any
		capabilities: any
		mower: any
		calendar: any
		planner: any
		metadata: any
		settings: any
		statistics: any
		positions: Array<Position>
	}
}

interface MowerData {
	data: MowerDataData
}

export async function AutomowerGetCoordinates(myTimer: Timer, context: InvocationContext): Promise<AutomowerPosition[]> {
	// Get bearer token
	const response = await fetch(authEndpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: `grant_type=client_credentials&client_id=${key}&client_secret=${secret}`
	})
	const data = await response.json()

	// Get mower data
	const mowerResponse = await fetch(`${endpoint}/mowers/${mowerId}`, {
		headers: {
			'X-Api-Key': key,
			'Authorization-Provider': 'husqvarna',
			'Authorization': `Bearer ${data.access_token}`
		}
	})
	const mowerData: MowerData = await mowerResponse.json()
	// Positions are in descending order. Reverse them to save in ascending order
	const positions = mowerData.data.attributes.positions.reverse()
	context.log('Positions:', positions.length)
	await new Promise(r => setTimeout(r, 100))
	context.log('First position:', positions[0])
	await new Promise(r => setTimeout(r, 100))
	context.log('Last position:', positions[positions.length - 1])
	await new Promise(r => setTimeout(r, 100))

	// Get last coordinates
	const tableRows: Array<AutomowerPosition> = (context.extraInputs.get(tableInput) as Array<AutomowerPosition>)
		.sort((a, b) => parseInt(a.RowKey) - parseInt(b.RowKey))
	context.log('Table rows:', tableRows.length)
	await new Promise(r => setTimeout(r, 100))
	context.log('First table row', tableRows[0])
	await new Promise(r => setTimeout(r, 100))
	context.log('Last table row', tableRows[tableRows.length - 1]);
	await new Promise(r => setTimeout(r, 100))

	// Diff with API coordinates
	// If we match 3 sets of coordinates in a row, then we are overlapping and we return everything prior
	const newPositions = positions.reduce((acc, position) => {
		// Check if we have a match
		const match = tableRows.findIndex(row => row.latitude === position.latitude && row.longitude === position.longitude)
		const newPositions = acc.positions
		let newOverlapping = acc.overlappingPositions
		if (match === -1) {
			// No match - add to positions
			newPositions.push(position)
		} else if (acc.overlappingPositions.length < 3) {
			// Matched, but not enough to be sure there's an overlap. Add to possible overlaps
			newOverlapping.push({index: match, position: tableRows[match]})
		} else if (acc.overlappingPositions.length === 3 &&
			acc.overlappingPositions[2].index - acc.overlappingPositions[1].index !== 1 ||
			acc.overlappingPositions[1].index - acc.overlappingPositions[0].index !== 1) {
			// 3 matches, but not consecutive. Keep going
			newPositions.concat(acc.overlappingPositions.map(o => o.position))
			newOverlapping = []
		}
		return { positions: newPositions, overlappingPositions: newOverlapping }
	}, { positions: [], overlappingPositions: [] })
		.positions

	context.log('New positions:', newPositions)
	await new Promise(r => setTimeout(r, 100))

	// Save new coordinates
	const now = new Date().getTime()
	return newPositions.map(
		(position, index) => ({
			PartitionKey: 'Automower',
			RowKey: (now + index).toString().padStart(20, '0'),
			latitude: position.latitude,
			longitude: position.longitude
		})
	)
}

let tableInput = input.table({
	connection: 'Storage',
	tableName: 'AutomowerPositions',
	filter: `RowKey gt '${(new Date().getTime() - (1000 * 60 * frequencyMinutes * 2)).toString().padStart(20, '0')}'`
})

const tableOutput = output.table({
	connection: 'Storage',
	tableName: 'AutomowerPositions'
})

app.timer('AutomowerGetCoordinates', {
	schedule: `0 0/${frequencyMinutes} * * * *`,
	//schedule: '* * * * * *',
	handler: AutomowerGetCoordinates,
	runOnStartup: true,
	extraInputs: [tableInput],
	return: tableOutput
})
