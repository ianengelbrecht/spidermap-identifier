<script>
	import { onMount } from 'svelte';
	import TomSelect from 'tom-select';
	import 'tom-select/dist/css/tom-select.css';
	import {
		coalesce,
		fmtDate,
		fetchAllFirebaseRecords,
		updateFirebaseRecordCount,
		fetchSpiderMapRecords,
		queryTaxa,
		getTaxonDetails,
		saveIdentification,
		deleteRecord,
		flagRecord,
		deleteDet
	} from '$lib';

	const baseApiUrl = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

	const lastRecordIndex = Number(localStorage.getItem('lastRecordIndex')) || 0;

	let records = $state([]); // for storing records we've seen
	let currentIndex = $state(lastRecordIndex);
	let currentRecord = $state(null);
	let error = $state(null);
	let imageURLs = $state([]);
	let fetching = $state(true);
	let searching = $state(false);
	let noMore = $state(false);
	let currentRecordVMRecords = $state([]);

	let displayIdx = $derived(currentIndex + 1);
	let imageDialog;
	let detDialog;
	let currentImageId = $state(null);
	let clickedImageUrl = $state(null);

	let tomSelect;
	let detSpCode = $state(null);
	let detOtherTaxon = $state('');
	let showOtherDetTaxon = $state(false);
	let detNotes = $state('');
	let savingDet = $state(false);

	let mapDialog;
	let recordCoordinates = $derived(
		currentRecord?.observation?.location?.decimalLatitude &&
			currentRecord?.observation?.location?.decimalLongitude
			? `${Number(currentRecord.observation.location.decimalLatitude).toFixed(6)},${Number(currentRecord.observation.location.decimalLongitude).toFixed(6)}`
			: null
	);

	$effect(async () => {
		clearSelect();
		detSpCode = null;
		detOtherTaxon = '';
		detNotes = '';
		showOtherDetTaxon = false;
		localStorage.setItem('lastRecordIndex', currentIndex);
		if (records.length > 0) {
			currentRecord = records[currentIndex];
			imageURLs =
				currentRecord?.observation?.taxaObserved?.[0]?.associatedMedia?.map((m) => m) || [];
			try {
				currentRecordVMRecords = await fetchSpiderMapRecords(
					currentRecord?.observation?.event?.observerContact,
					currentRecord?.observation?.event?.year,
					currentRecord?.observation?.event?.month,
					currentRecord?.observation?.event?.day,
					currentRecord?.observation?.location?.closestTown
				);
			} catch (e) {
				console.error('error fetching VM records:', e);
				alert('Error fetching VM records: ' + e.message);
				console.log('record key:', records[currentIndex]?.key);
				currentRecordVMRecords = [];
			}
		}
	});

	(async function () {
		try {
			records = await fetchAllFirebaseRecords();
			console.log('fetched', records.length, 'records');
			if (records.length > 0) {
				currentRecord = records[currentIndex];
				imageURLs =
					currentRecord?.observation?.taxaObserved?.[0]?.associatedMedia?.map((m) => m) || [];
			}
		} catch (e) {
			error = e;
		} finally {
			fetching = false;
		}
	})();

	onMount(() => {
		tomSelect = new TomSelect('#taxonname-select', {
			create: false,
			placeholder: 'Type to search for a taxon',
			valueField: 'sp_code',
			labelField: 'scientific_name',
			searchField: 'scientific_name',
			loadThrottle: 400,
			// fetch remote data
			load: function (query, callback) {
				var url = '/api/taxa?q=' + encodeURIComponent(query);
				fetch(url)
					.then((response) => response.json())
					.then((json) => {
						callback(json.results);
					})
					.catch(() => {
						callback();
					});
			}
		});
	});

	async function prev() {
		if (currentIndex > 0) {
			currentIndex--;
		}
	}

	async function next() {
		searching = true;
		let localIndex = currentIndex + 1;
		while (localIndex < records.length - 1) {
			const thisRecord = records[localIndex];
			if (thisRecord?.observation?.taxaObserved?.[0]?.identifications?.length > 0) {
				localIndex++;
				continue;
			} else {
				let vmRecords;
				try {
					vmRecords = await fetchSpiderMapRecords(
						thisRecord?.observation?.event?.observerContact,
						thisRecord?.observation?.event?.year,
						thisRecord?.observation?.event?.month,
						thisRecord?.observation?.event?.day,
						thisRecord?.observation?.location?.closestTown
					);
				} catch (e) {
					console.log('got as far as', localIndex + 1);
					console.log('record key:', records[localIndex]?.key);
					error = e;
					break;
				}

				if (
					vmRecords.length == 1 &&
					vmRecords.some((r) => r.scientific_name.toLowerCase() == 'araneae indet.')
				) {
					console.log(vmRecords[0]);
					currentIndex = localIndex;
					searching = false;
					break;
				} else {
					localIndex++;
				}
			}
		}
		searching = false;
		if (localIndex >= records.length - 1) {
			noMore = true;
		}
	}

	async function handleCopyCoords() {
		if (recordCoordinates) {
			navigator.clipboard.writeText(recordCoordinates).then(() => {
				console.log(`Copied coordinates to clipboard: ${recordCoordinates}`);
			});
		} else {
			alert('No coordinates available to copy.');
		}
	}

	function clearSelect() {
		tomSelect?.clear();
		tomSelect?.clearOptions();
	}

	async function handleSaveIdentification() {
		if (!detSpCode && !detOtherTaxon) {
			return;
		}
		savingDet = true;

		try {
			let taxonDetails;
			if (detSpCode) {
				taxonDetails = await getTaxonDetails(detSpCode);
			} else {
				taxonDetails = {
					sp_code: 'OTHER',
					scientific_name: detOtherTaxon,
					family: 'other',
					taxonomic_authority: ''
				};
			}
			if (!taxonDetails) {
				throw new Error('Could not fetch taxon details for sp_code: ' + detSpCode);
			}

			const detRecord = taxonDetails; // we'll modify this
			detRecord.identifiedBy = 'Engelbrecht, I.';
			detRecord.identificationRemarks = $state.snapshot(detNotes);
			detRecord.dateIdentified = new Date().toISOString().split('T')[0];

			if ('identifications' in currentRecord?.observation?.taxaObserved?.[0]) {
				const identifications = currentRecord.observation.taxaObserved[0].identifications;
				identifications.push(detRecord);
			} else {
				currentRecord.observation.taxaObserved[0].identifications = [detRecord];
			}

			await saveIdentification(currentRecord.key, currentRecord.observation.taxaObserved);
			clearSelect();
			detNotes = '';
			detDialog.close();
		} catch (error) {
			console.error('Error fetching taxon details:', error);
		} finally {
			savingDet = false;
		}
	}

	async function handleFlagRecord() {
		try {
			await flagRecord(currentRecord.key);
			alert('Record flagged');
		} catch (error) {
			console.error('Error flagging record:', error);
			alert('Failed to flag record: ' + error.message);
		}
	}

	async function handleDeleteDet(event) {
		const confirmed = confirm(
			'Are you sure you want to delete this identification? This action cannot be undone.'
		);
		if (!confirmed) return;
		const detIndex = event.currentTarget.getAttribute('data-det-index');
		if (detIndex === null) {
			alert('No det index found.');
			return;
		}
		try {
			currentRecord.observation.taxaObserved[0].identifications.splice(detIndex, 1);
			await deleteDet(currentRecord.key, currentRecord.observation.taxaObserved);
		} catch (error) {
			console.error('Error deleting identification:', error);
			alert('Failed to delete identification: ' + error.message);
		}
	}

	async function handleDeleteRecord() {
		const confirmed = confirm(
			'Are you sure you want to delete this record? This action cannot be undone.'
		);
		if (!confirmed) return;
		try {
			await deleteRecord(currentRecord.key);
			records.splice(currentIndex, 1);
			if (currentIndex >= records.length) {
				currentIndex = records.length - 1;
			}
			if (records.length > 0) {
				currentRecord = records[currentIndex];
				imageURLs =
					currentRecord?.observation?.taxaObserved?.[0]?.associatedMedia?.map((m) => m) || [];
				currentRecordVMRecords = await fetchSpiderMapRecords(
					currentRecord?.observation?.event?.observerContact,
					currentRecord?.observation?.event?.year,
					currentRecord?.observation?.event?.month,
					currentRecord?.observation?.event?.day,
					currentRecord?.observation?.location?.closestTown
				);
			} else {
				currentRecord = null;
				imageURLs = [];
				currentRecordVMRecords = [];
			}
			await updateFirebaseRecordCount(records.length);
		} catch (error) {
			console.error('Error deleting record:', error);
			alert('Failed to delete record: ' + error.message);
		}
	}

	function resetSearch() {
		noMore = false;
		currentIndex = 0;
	}
</script>

<main class="flex h-screen w-screen flex-col p-4">
	<nav class="flex items-center justify-between">
		<a href="/" class="flex items-center space-x-4">
			<img
				class="h-16"
				src="https://www.baboonspideratlas.co.za/templates/yootheme/cache/f7/bsalogo-f75a38d6.webp"
				alt="Logo"
			/>
			<span class="text-xl font-semibold text-amber-700 italic">Record identifier</span>
		</a>
		<ul class="flex space-x-4">
			<li><a href="/">Home</a></li>
			<li><a href="/about">About</a></li>
			<li><a href="/contact">Contact</a></li>
		</ul>
	</nav>
	<section
		class="flex w-full flex-grow flex-col items-center justify-center rounded border border-gray-200"
	>
		{#if fetching}
			<p>Loading records...</p>
		{:else if searching}
			<p>Searching for next record without dets...</p>
		{:else if noMore}
			<p>No more records without dets found.</p>
			<button
				class="mt-4 rounded border border-gray-300 bg-blue-500 px-4 py-2 text-white hover:bg-blue-400"
				onclick={resetSearch}>Start over</button
			>
		{:else if error}
			<p>Error loading record: {error.message}</p>
		{:else}
			<div class="mb-2">
				<button
					class="w-32 rounded border px-4 py-2 hover:bg-gray-100"
					onclick={prev}
					disabled={currentIndex === 0}>← Prev</button
				>
				<button class="w-32 rounded border px-4 py-2 hover:bg-gray-100" onclick={next}
					>Next →</button
				>
			</div>
			<span class="flex w-1/2 items-center justify-center"
				>Record
				<input
					type="number"
					class="mx-2 w-24 rounded border border-gray-200 px-2 py-1 text-center"
					bind:value={displayIdx}
					min="1"
					onchange={() => (currentIndex = displayIdx - 1)}
				/>
				of {records.length} records</span
			>

			<div class="w-1/2">
				{#if currentRecord}
					<div class="grid">
						<span><strong>Record ID:</strong> {currentRecord.key}</span>
						<div><strong>Date:</strong> {fmtDate(currentRecord?.observation?.event)}</div>
						<div>
							<strong>Observer:</strong>
							{coalesce(currentRecord?.observation?.event?.recordedBy)}
							({coalesce(currentRecord?.observation?.event?.observerContact)})
						</div>
						<div>
							<strong>Locality:</strong>
							{[
								coalesce(currentRecord?.observation?.location?.country),
								coalesce(currentRecord?.observation?.location?.stateProvince),
								coalesce(currentRecord?.observation?.location?.closestTown),
								coalesce(currentRecord?.observation?.location?.locality)
							]
								.filter((part) => part && part !== 'None')
								.join(', ')}
						</div>
						<div class="flex items-center">
							<strong>Coords:</strong>
							{recordCoordinates ? recordCoordinates : 'None'}
							{#if recordCoordinates}
								<button
									class="ml-2 rounded p-1 text-gray-400 hover:bg-gray-100"
									onclick={handleCopyCoords}
									aria-label="Copy coordinates to clipboard"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										height="24px"
										viewBox="0 -960 960 960"
										width="24px"
										fill="currentColor"
										><path
											d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"
										/></svg
									>
								</button>
								<button
									class="ml-2 rounded p-1 text-gray-400 hover:bg-gray-100"
									onclick={() => mapDialog.showModal()}
									aria-label="Copy coordinates to clipboard"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										height="24px"
										viewBox="0 -960 960 960"
										width="24px"
										fill="currentColor"
										><path
											d="M640-560v-126 126ZM174-132q-20 8-37-4.5T120-170v-560q0-13 7.5-23t20.5-15l212-72 240 84 186-72q20-8 37 4.5t17 33.5v337q-15-23-35.5-42T760-528v-204l-120 46v126q-21 0-41 3.5T560-546v-140l-160-56v523l-226 87Zm26-96 120-46v-468l-120 40v474Zm440-12q34 0 56.5-20t23.5-60q1-34-22.5-57T640-400q-34 0-57 23t-23 57q0 34 23 57t57 23Zm0 80q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 23-5.5 43.5T778-238l102 102-56 56-102-102q-18 11-38.5 16.5T640-160ZM320-742v468-468Z"
										/></svg
									>
								</button>
							{/if}
						</div>
						<div>
							<strong>Remarks:</strong>
							{coalesce(currentRecord?.observation?.taxaObserved?.[0].occurrenceRemarks, 'None')}
						</div>
						<div>
							<strong>VM records:</strong>
							{currentRecordVMRecords.length}
						</div>
						<div>
							<strong>VM Dets:</strong>
							{#each currentRecordVMRecords as r}
								<div class="ml-4">
									{r.scientific_name}
								</div>
							{/each}
						</div>
						<div>
							<strong>Firebase Dets:</strong>
							{#each currentRecord.observation.taxaObserved[0].identifications || [] as det, index}
								<div class="ml-4 flex items-center">
									{det.scientific_name}
									<button
										onclick={handleDeleteDet}
										class="text-gray-400 hover:cursor-pointer"
										aria-label="Delete identification"
										data-det-index={index}
										><svg
											xmlns="http://www.w3.org/2000/svg"
											height="24px"
											viewBox="0 -960 960 960"
											width="24px"
											fill="currentColor"
											><path
												d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"
											/></svg
										></button
									>
								</div>
							{/each}
						</div>
						<button class="my-2 rounded border p-2" onclick={() => detDialog.showModal()}
							>Add identification</button
						>
					</div>
					<div class="flex h-32 items-center justify-center overflow-hidden">
						<div class="images">
							{#key currentRecord.key}
								{#if imageURLs.length === 0}
									<div class="muted">No images.</div>
								{:else}
									<div class="flex w-full justify-between gap-2">
										{#each imageURLs as u, i}
											<button
												onclick={() => {
													clickedImageUrl = u.publicURL;
													currentImageId = u.url.split('.')[0];
													imageDialog.showModal();
												}}
												class="hover:cursor-pointer"
											>
												<img
													src={u.publicURL}
													id={u.url.split('.')[0]}
													class="w-32"
													alt="asfdasdf"
													loading="lazy"
												/>
											</button>
										{/each}
									</div>
								{/if}
							{/key}
						</div>
					</div>
					<details class="">
						<summary>Raw JSON</summary>
						<pre class="">{JSON.stringify(currentRecord, null, 2)}</pre>
					</details>
					<button class="rounded border p-2 hover:cursor-pointer" onclick={handleFlagRecord}
						>Flag record</button
					>
					<button class="rounded border p-2 hover:cursor-pointer" onclick={handleDeleteRecord}
						>Delete record</button
					>
				{/if}
			</div>
		{/if}
	</section>
</main>
<dialog class="relative m-auto" bind:this={imageDialog}>
	<div class="relative">
		<img id={currentImageId} src={clickedImageUrl} alt="large view" />
	</div>
	<button
		class="absolute top-8 right-8 block rounded bg-gray-100 px-4 py-2 text-gray-400 hover:cursor-pointer"
		aria-label="close dialog"
		onclick={() => imageDialog?.close()}
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			height="48px"
			viewBox="0 -960 960 960"
			width="48px"
			fill="currentColor"
			><path
				d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"
			/></svg
		>
	</button>
</dialog>
<dialog class="relative m-auto w-1/3 rounded p-4" bind:this={detDialog}>
	<h2 class="text-xl font-semibold">Add a new identification:</h2>
	<div class="flex gap-1">
		<div class="relative flex-grow">
			<select name="" id="taxonname-select" class="h-8 w-full" bind:value={detSpCode}></select>
			<button
				class="absolute top-[6px] right-2 z-20 rounded text-gray-400 hover:cursor-pointer"
				onclick={clearSelect}
				aria-label="Clear selection"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					height="24px"
					viewBox="0 -960 960 960"
					width="24px"
					fill="currentColor"
					><path
						d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"
					/></svg
				>
			</button>
		</div>
		<button
			class="text-gray-400 hover:cursor-pointer"
			onclick={() => (showOtherDetTaxon = !showOtherDetTaxon)}
			aria-label="Toggle other taxon input"
			title="Toggle other taxon input"
		>
			<svg
				class:rotate-180={showOtherDetTaxon}
				xmlns="http://www.w3.org/2000/svg"
				height="24px"
				viewBox="0 -960 960 960"
				width="24px"
				fill="currentColor"
				><path d="M440-800v487L216-537l-56 57 320 320 320-320-56-57-224 224v-487h-80Z" /></svg
			>
		</button>
	</div>
	{#if showOtherDetTaxon}
		<input
			type="text"
			class="mt-2 w-full rounded border border-gray-300 p-2"
			placeholder="Other taxon"
			bind:value={detOtherTaxon}
		/>
	{/if}
	<textarea
		name="det_notes"
		id=""
		class="mt-2 h-24 w-full rounded border border-gray-300 p-2"
		placeholder="Notes"
		bind:value={detNotes}
	></textarea>
	<div class="flex items-center justify-between">
		<button
			class="mt-2 rounded border p-2 hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
			type="button"
			disabled={savingDet}
			onclick={() => detDialog.close()}>Cancel</button
		>
		{#if savingDet}
			<span class="text-blue-400">
				<svg
					class="animate-spin"
					xmlns="http://www.w3.org/2000/svg"
					height="24px"
					viewBox="0 -960 960 960"
					width="24px"
					fill="currentColor"
					><path
						d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q17 0 28.5 11.5T520-840q0 17-11.5 28.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480q0-17 11.5-28.5T840-520q17 0 28.5 11.5T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Z"
					/></svg
				>
			</span>
		{:else}
			<button
				class="mt-2 w-16 rounded border bg-blue-400 p-2 text-white hover:cursor-pointer"
				type="button"
				onclick={handleSaveIdentification}>Save</button
			>
		{/if}
	</div>
</dialog>
<dialog bind:this={mapDialog} class="relative m-auto rounded p-1">
	{#if recordCoordinates}
		<img
			src={`https://maps.googleapis.com/maps/api/staticmap?center=${recordCoordinates}&zoom=8&size=500x400&maptype=terrain&key=${baseApiUrl}&markers=${recordCoordinates}`}
			alt="location map"
		/>
	{:else}
		<p>No coordinates available for this record.</p>
	{/if}
	<div class="flex justify-end">
		<button
			class="absolute top-2 right-2 mt-2 rounded bg-gray-100 p-2 text-gray-400 hover:cursor-pointer hover:bg-gray-200"
			type="button"
			disabled={savingDet}
			onclick={() => mapDialog.close()}
			aria-label="Close map dialog"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				height="48px"
				viewBox="0 -960 960 960"
				width="48px"
				fill="currentColor"
				><path
					d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"
				/></svg
			></button
		>
	</div>
</dialog>
