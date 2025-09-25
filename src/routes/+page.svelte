<script>
	import { initializeApp } from 'firebase/app';
	import { getDatabase, ref, onValue } from 'firebase/database';
	import { getStorage, ref as stRef, getDownloadURL } from 'firebase/storage';

	let idx = $state(0);
	let error = null;
	let imageUrls = $state([]);
	let fetching = $state(false);
	let fetchingImages = $state(false);
	let showRaw = $state(false);
	let displayIdx = $derived(idx + 1);
	let dialog;
	let clickedImageUrl = $state(null);

	$effect(() => {
		if (idx) {
			loadImagesForCurrent();
		}
	});

	const fbConfig = {
		apiKey: 'AIzaSyBS7rPtI9G9AbZZ-dDuywQ2jERPPiQfPeQ',
		authDomain: 'whatsthat-c5a89.firebaseapp.com',
		databaseURL: 'https://whatsthat-c5a89.firebaseio.com',
		storageBucket: 'whatsthat-c5a89.appspot.com',
		messagingSenderId: '674861285189'
	};

	const app = initializeApp(fbConfig);
	const database = getDatabase(app);
	const storage = getStorage(app);

	// 2) Load all records once (simple first version)
	let records = [];
	(async function () {
		fetching = true;
		const recordRef = ref(database, 'records');
		onValue(recordRef, (snapshot) => {
			const raw = snapshot.exists() ? snapshot.val() : {};
			// Normalize into an array with key
			records.push(...Object.entries(raw).map(([key, value]) => ({ key, ...value })));
			console.log(records.length + ' records loaded');
			fetching = false;
		});
	})();

	async function loadImagesForCurrent() {
		fetchingImages = true;
		imageUrls = [];
		const r = records[idx];
		if (!r) return;
		const media = r?.observation?.taxaObserved?.[0]?.associatedMedia ?? [];
		if (!Array.isArray(media) || media.length === 0) return;

		const urls = await Promise.all(
			media.map(async (m) => {
				try {
					// m.url is a Storage fullPath like "images/abc.jpg" (or a gs:// / https URL)
					return await getDownloadURL(stRef(storage, m.url));
				} catch {
					return null;
				}
			})
		);
		console.log(urls);
		imageUrls = urls.filter(Boolean);
		fetchingImages = false;
	}

	function prev() {
		if (idx > 0) {
			idx--;
			imageUrls.length = 0; // clear images when going back
		}
	}
	function next() {
		if (idx < records.length - 1) {
			idx++;
			imageUrls.length = 0; // clear images when going forward
		}
	}

	function coalesce(v) {
		return v === null || v === undefined || v === '' ? '—' : String(v);
	}

	function fmtDate(ev) {
		const y = ev?.year;
		const m = ev?.month; // likely stored as 1–12 in the legacy form
		const d = ev?.day;
		if (y && d && m !== undefined && m !== null) {
			const monthIndex = Math.max(0, Number(m) - 1);
			const dt = new Date(Number(y), monthIndex, Number(d));
			return isNaN(+dt) ? '—' : dt.toDateString();
		}
		return '—';
	}

	function copyCoords() {
		const r = records[idx];
		if (!r) return;
		const lat = coalesce(Number(r?.observation?.location?.decimalLatitude).toFixed(6));
		const lon = coalesce(Number(r?.observation?.location?.decimalLongitude).toFixed(6));
		if (lat !== '—' && lon !== '—') {
			const text = `${lat}, ${lon}`;
			navigator.clipboard.writeText(text).then(() => {
				console.log(`Copied coordinates to clipboard: ${text}`);
			});
		}
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
		class="flex flex-grow flex-col items-center justify-center rounded border border-gray-200"
	>
		{#if fetching}
			<p>Loading records...</p>
		{:else}
			<div class="toolbar">
				<button
					class="w-32 rounded border px-4 py-2 hover:bg-gray-100"
					onclick={prev}
					disabled={idx === 0}>← Prev</button
				>
				<button
					class="w-32 rounded border px-4 py-2 hover:bg-gray-100"
					onclick={next}
					disabled={idx === records.length - 1}>Next →</button
				>
			</div>
			<span class="flex w-128 justify-center"
				>Record
				<input
					type="number"
					class="w-16 rounded border border-gray-200 px-2 py-1 text-center"
					bind:value={displayIdx}
					min="1"
					max={records.length}
					onchange={() => (idx = displayIdx - 1)}
				/>
				of {records.length} (key: {records[idx].key})</span
			>

			<div class="card">
				{#if records[idx]}
					<div class="grid">
						<div><strong>Date:</strong> {fmtDate(records[idx]?.observation?.event)}</div>
						<div>
							<strong>Observer:</strong>
							{coalesce(records[idx]?.observation?.event?.recordedBy)}
						</div>
						<div>
							<strong>Email:</strong>
							{coalesce(records[idx]?.observation?.event?.observerContact)}
						</div>
						<div>
							<strong>Country:</strong>
							{coalesce(records[idx]?.observation?.location?.country)}
						</div>
						<div>
							<strong>Sate/Province:</strong>
							{coalesce(records[idx]?.observation?.location?.stateProvince)}
						</div>
						<div>
							<strong>Closest town:</strong>
							{coalesce(records[idx]?.observation?.location?.closestTown)}
						</div>
						<div>
							<strong>Locality:</strong>
							{coalesce(records[idx]?.observation?.location?.locality)}
						</div>
						<div class="flex items-center">
							<strong>Coords:</strong>
							{coalesce(Number(records[idx]?.observation?.location?.decimalLatitude)?.toFixed(6))} ,
							{coalesce(Number(records[idx]?.observation?.location?.decimalLongitude)?.toFixed(6))}
							<button
								class="ml-2 rounded p-1 text-gray-400 hover:bg-gray-100"
								onclick={copyCoords}
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
						</div>
					</div>
					<div class="flex h-32 items-center justify-center overflow-hidden">
						{#if fetchingImages}
							<p>Loading images...</p>
						{:else}
							<div class="images">
								{#if imageUrls.length === 0}
									<div class="muted">No images.</div>
								{:else}
									<div class="flex w-full justify-between gap-2">
										{#each imageUrls as u}
											<button
												onclick={() => {
													clickedImageUrl = u;
													dialog.showModal();
												}}
												class="hover:cursor-pointer"
											>
												<img src={u} class="w-32" alt="asfdasdf" loading="lazy" />
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<details class="raw">
						<summary>Raw JSON</summary>
						<pre>{JSON.stringify(records[idx], null, 2)}</pre>
					</details>
				{/if}
			</div>
		{/if}
	</section>
</main>
<dialog class="relative m-auto" bind:this={dialog}>
	<img src={clickedImageUrl} alt="large view" />
	<button
		class="absolute top-8 right-8 block rounded px-4 py-2 text-gray-400 hover:bg-gray-100"
		aria-label="close dialog"
		onclick={() => dialog?.close()}
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
