import { getNewPositions } from "../functions/AutomowerGetCoordinates";

describe("getNewPositions", () => {
	it("should return no positions", async () => {
		const positions = [
			{latitude: 6, longitude: 6},
			{latitude: 5, longitude: 5},
			{latitude: 4, longitude: 4},
			{latitude: 3, longitude: 3},
			{latitude: 2, longitude: 2},
			{latitude: 1, longitude: 1}
		]
		const tableRows = [
			{partitionKey: "6", rowKey: "6", latitude: 6, longitude: 6},
			{partitionKey: "5", rowKey: "5", latitude: 5, longitude: 5},
			{partitionKey: "4", rowKey: "4", latitude: 4, longitude: 4},
			{partitionKey: "3", rowKey: "3", latitude: 3, longitude: 3},
			{partitionKey: "2", rowKey: "2", latitude: 2, longitude: 2},
			{partitionKey: "1", rowKey: "1", latitude: 1, longitude: 1}
		]
		const result = await getNewPositions(positions, tableRows)
		expect(result.length).toEqual(0)
	})

	it("should return one position - one new position not in the table", async () => {
		const positions = [
			{latitude: 7, longitude: 7},
			{latitude: 6, longitude: 6},
			{latitude: 5, longitude: 5},
			{latitude: 4, longitude: 4},
			{latitude: 3, longitude: 3},
			{latitude: 2, longitude: 2},
			{latitude: 1, longitude: 1}
		]
		const tableRows = [
			{partitionKey: "6", rowKey: "6", latitude: 6, longitude: 6},
			{partitionKey: "5", rowKey: "5", latitude: 5, longitude: 5},
			{partitionKey: "4", rowKey: "4", latitude: 4, longitude: 4},
			{partitionKey: "3", rowKey: "3", latitude: 3, longitude: 3},
			{partitionKey: "2", rowKey: "2", latitude: 2, longitude: 2},
			{partitionKey: "1", rowKey: "1", latitude: 1, longitude: 1}
		]
		const result = await getNewPositions(positions, tableRows)
		expect(result.length).toEqual(1)
	})

	it("should return one position - one new position not in the table, one old position not in the table", async () => {
		const positions = [
			{latitude: 7, longitude: 7},
			{latitude: 6, longitude: 6},
			{latitude: 5, longitude: 5},
			{latitude: 4, longitude: 4},
			{latitude: 3, longitude: 3},
			{latitude: 2, longitude: 2},
			{latitude: 1, longitude: 1}
		]
		const tableRows = [
			{partitionKey: "6", rowKey: "6", latitude: 6, longitude: 6},
			{partitionKey: "5", rowKey: "5", latitude: 5, longitude: 5},
			{partitionKey: "4", rowKey: "4", latitude: 4, longitude: 4},
			{partitionKey: "3", rowKey: "3", latitude: 3, longitude: 3},
			{partitionKey: "2", rowKey: "2", latitude: 2, longitude: 2},
		]
		const result = await getNewPositions(positions, tableRows)
		expect(result.length).toEqual(1)
	})

	it("should return one position - one new position not in the table, one new position gone, one old position in the table", async () => {
		const positions = [
			{latitude: 7, longitude: 7},
			{latitude: 6, longitude: 6},
			{latitude: 5, longitude: 5},
			{latitude: 4, longitude: 4},
			{latitude: 3, longitude: 3},
			{latitude: 2, longitude: 2}
		]
		const tableRows = [
			{partitionKey: "6", rowKey: "6", latitude: 6, longitude: 6},
			{partitionKey: "5", rowKey: "5", latitude: 5, longitude: 5},
			{partitionKey: "4", rowKey: "4", latitude: 4, longitude: 4},
			{partitionKey: "3", rowKey: "3", latitude: 3, longitude: 3},
			{partitionKey: "2", rowKey: "2", latitude: 2, longitude: 2},
			{partitionKey: "1", rowKey: "1", latitude: 1, longitude: 1},
		]
		const result = await getNewPositions(positions, tableRows)
		expect(result.length).toEqual(1)
	})

	it("should return one position - one new position not in the table, one new position gone, only two existing in table", async () => {
		const positions = [
			{latitude: 7, longitude: 7},
			{latitude: 6, longitude: 6},
			{latitude: 5, longitude: 5},
			{latitude: 4, longitude: 4},
			{latitude: 3, longitude: 3},
			{latitude: 2, longitude: 2}
		]
		const tableRows = [
			{partitionKey: "6", rowKey: "6", latitude: 6, longitude: 6},
			{partitionKey: "5", rowKey: "5", latitude: 5, longitude: 5}
		]
		const result = await getNewPositions(positions, tableRows)
		expect(result.length).toEqual(1)
	})

	it("should return one position - one new position not in the table, one new position gone, only one existing in table", async () => {
		const positions = [
			{latitude: 7, longitude: 7},
			{latitude: 6, longitude: 6},
			{latitude: 5, longitude: 5},
			{latitude: 4, longitude: 4},
			{latitude: 3, longitude: 3},
			{latitude: 2, longitude: 2}
		]
		const tableRows = [
			{partitionKey: "6", rowKey: "6", latitude: 6, longitude: 6}
		]
		const result = await getNewPositions(positions, tableRows)
		expect(result.length).toEqual(1)
	})

	it("should return two positions - one new position not in the table, one new position gone, only one existing in table", async () => {
		const positions = [
			{latitude: 8, longitude: 8},
			{latitude: 7, longitude: 7},
			{latitude: 6, longitude: 6},
			{latitude: 5, longitude: 5},
			{latitude: 4, longitude: 4},
			{latitude: 3, longitude: 3},
			{latitude: 2, longitude: 2}
		]
		const tableRows = [
			{partitionKey: "6", rowKey: "6", latitude: 6, longitude: 6}
		]
		const result = await getNewPositions(positions, tableRows)
		expect(result.length).toEqual(2)
	})


	it("should return all positions - table empty", async () => {
		const positions = [
			{latitude: 1, longitude: 1},
			{latitude: 2, longitude: 2},
			{latitude: 3, longitude: 3},
			{latitude: 4, longitude: 4},
			{latitude: 5, longitude: 5},
			{latitude: 6, longitude: 6},
		]
		const tableRows = []
		const result = await getNewPositions(positions, tableRows)
		expect(result.length).toEqual(6)
	})

	it("should return all positions - table has matching positions not in order", async () => {
		const positions = [
			{latitude: 1, longitude: 1},
			{latitude: 2, longitude: 2},
			{latitude: 3, longitude: 3},
			{latitude: 4, longitude: 4},
			{latitude: 5, longitude: 5},
			{latitude: 6, longitude: 6},
		]
		const tableRows = [
			{partitionKey: "3", rowKey: "3", latitude: 3, longitude: 3},
			{partitionKey: "1", rowKey: "1", latitude: 1, longitude: 1},
			{partitionKey: "2", rowKey: "2", latitude: 2, longitude: 2},
			{partitionKey: "5", rowKey: "5", latitude: 5, longitude: 5},
			{partitionKey: "4", rowKey: "4", latitude: 4, longitude: 4},
			{partitionKey: "6", rowKey: "6", latitude: 6, longitude: 6},
		]
		const result = await getNewPositions(positions, tableRows)
		expect(result.length).toEqual(6)
	})
})
