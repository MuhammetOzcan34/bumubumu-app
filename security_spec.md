# BUMUBUMU Security Specification

## 1. Data Invariants

1. **Mükerrer Oy Engeli**: Bir kullanıcı bir gönderiye yalnızca bir kere oy kullanabilir. Oylama kaydı `/posts/{postId}/votes/{userId}` dökümanı olarak saklanır. Döküman adı üye ID'sine eşit olmak zorundadır.
2. **Kolektif Atomiklik**: Bir oylama yapıldığında, post dökümanındaki `voteCountA`/`voteCountB` ile `totalVotes` sayaçlarının artması, oylama kaydının (`/posts/{postId}/votes/{userId}`) oluşturulmasıyla aynı batch içinde atomic olarak gerçekleşmelidir (`existsAfter`).
3. **Özel Grup Mahremiyeti**: Özel gruplara özel gönderilere (`groupId != "global"` veya boş değilse) yalnızca grup üyesi olan (`/groups/{groupId}/members/{userId}`) kullanıcılar erişebilir ve oylayabilir.
4. **Bölünmüş Yorum Kısıtı**: Bir gönderiye yorum yapabilmek için ilgili gönderide oy kullanmış olmak şarttır (`exists(/posts/{postId}/votes/{userId})`).
5. **Kullanıcı Bilgilerinin Ayrıştırılması**: PII (Hassas ve Özel veri) içeren `/users/{userId}` dökümanları sadece sahibine veya Admin'e açık olmalıdır. `role` veya `points` gibi hassas roller sadece admin tarafından güncellenebilir. Genel profil kısmı `/profiles/{userId}` altından herkese açık okunabilir.
6. **DM Mahremiyeti**: İki kişi arasındaki sohbet odasına yalnızca `participantIds` listesinde UID'si bulunan kullanıcılar erişebilir.

---

## 2. The "Dirty Dozen" (Kirli 12) Saldırı Senaryoları & Payload Analizi

Uygulamayı hacklemeye çalışacak kötü niyetli kullanıcıların gönderebileceği 12 saldırı yükü ve bunları nasıl engelleyeceğimiz:

### 1. Rol Yükseltme Saldırısı (Privilege Escalation)
* **Saldırı**: Kullanıcı kendisini `admin` yapmak için `/users/{userId}` dökümanındaki `role` alanını günceller.
* **Payload**: `UPDATE /users/attackerUID { role: "admin" }`
* **Sonuç**: `PERMISSION_DENIED` - Sadece mevcut adminler veya kullanıcı oluştururken varsayılan "user" rolü ile oluşturma kuralı dışındakiler engellenecektir.

### 2. Puan Çalma / Hackleme (Reward Point Injection)
* **Saldırı**: Kullanıcı sponsorlu olmayan gönderiyi oylayarak veya direkt profiline puan basarak `/users/{userId}` içine `points` ekler.
* **Payload**: `UPDATE /users/attackerUID { points: 999999 }`
* **Sonuç**: `PERMISSION_DENIED` - Normal kullanıcı `points` alanını kendisi doğrudan artıramaz.

### 3. Oy Sayaçlarını Manipüle Etme (Vote Count Hijack)
* **Saldırı**: Kullanıcı oy kullanmadan bir gönderinin `voteCountA` sayacını api üzerinden astronomik olarak artırır.
* **Payload**: `UPDATE /posts/post123 { voteCountA: 500000, totalVotes: 500000 }`
* **Sonuç**: `PERMISSION_DENIED` - `existsAfter(/posts/post123/votes/attackerUID)` koşulu ile aynı batch'te oy dökümanı yoksa reddedilir.

### 4. Mükerrer Oy Saldırısı (Double Voting)
* **Saldırı**: Kullanıcı zaten oy verdiği halde `/posts/postId/votes/attackerUID` dökümanını döküman ID'si hackerUID olmayacak şekilde yeniden yazmayı veya dökümanı silip tekrar oy kullanmayı dener.
* **Payload**: `CREATE /posts/post123/votes/someRandomId { userId: "attackerUID", votedOption: "A" }`
* **Sonuç**: `PERMISSION_DENIED` - Döküman adının `request.auth.uid` olması koşulu bulunur.

### 5. Özel Grup Verisi Sızdırma (Private Group Data Leak)
* **Saldırı**: Grup üyesi olmayan hacker, özel bir grubun gönderilerini listelemek ister.
* **Payload**: `GET /posts/privatePost123`
* **Sonuç**: `PERMISSION_DENIED` - Gönderideki `groupId` üzerinden grup üyeliği get() kontrolü yapılır.

### 6. Başkası Adına Yorum Yapma (Identity Spoofing in Comments)
* **Saldırı**: Hacker, kurban adına yorum ekler.
* **Payload**: `CREATE /posts/post123/comments/comment456 { userId: "victimUID", text: "Kötü yorum" }`
* **Sonuç**: `PERMISSION_DENIED` - Yorumdaki `incoming().userId == request.auth.uid` olmalıdır.

### 7. Oy Vermeden Bölünmüş Yorum Yapma (No-vote Commenting)
* **Saldırı**: Gönderide oy kullanmadığı halde akıştaki bölünmüş tartışmalara dahil olmak üzere yorum yazmaya çalışır.
* **Payload**: `CREATE /posts/post123/comments/comment456 { userId: "attackerUID", text: "Oy vermedim ama bence..." }`
* **Sonuç**: `PERMISSION_DENIED` - `exists(/posts/post123/votes/attackerUID)` kontrolü yorum oluşturulurken zorunludur.

### 8. DM Odası İntihal / Gizlice Okuma (DM Eavesdropping)
* **Saldırı**: İki arkadaşın özel konuşmalarını dışarıdan bir kullanıcı listelemeye ve mesajları okumaya çalışır.
* **Payload**: `GET /chats/alice_bob` (Katılımcı hacker değil)
* **Sonuç**: `PERMISSION_DENIED` - `request.auth.uid in resource.data.participantIds` kuralı engeller.

### 9. Başkası Adına DM Atma (DM Message Spoofing)
* **Saldırı**: Başkasının sohbet odasına onun adıyla mesaj ekler.
* **Payload**: `CREATE /chats/alice_bob/messages/msg789 { senderId: "alice", text: "Sahte mesajdır" }` (gönderen hacker)
* **Sonuç**: `PERMISSION_DENIED` - `request.auth.uid` ile `senderId` uyuşmak zorundadır.

### 10. Spam Gönderi ID'si ile Cihaz Kaynak Tüketimi (Resource Poisoning)
* **Saldırı**: Gönderi veya grup ID'si olarak çok uzun ya da geçersiz karakterler barındıran parametre gönderilir.
* **Payload**: `CREATE /posts/SPAM_LONG_STRING_99999...`
* **Sonuç**: `PERMISSION_DENIED` - `isValidId()` ID sınırlaması ve boyut kontrolleri çalışır.

### 11. Geçmişe Yönelik Gönderi Oluşturma (Temporal Fraud)
* **Saldırı**: Kullanıcı, gönderinin oluşturulma tarihini (`createdAt`) geçmiş veya gelecek bir zamana manipüle ederek gönderiyi taze tutmaya çalışır.
* **Payload**: `CREATE /posts/post123 { createdAt: "2030-01-01T00:00:00Z" }`
* **Sonuç**: `PERMISSION_DENIED` - `createdAt == request.time` sunucu zaman damgası kuralı ile kontrol edilir.

### 12. Diğer Üyelerin Profil Bilgilerini Değiştirme (Profile Hijacking)
* **Saldırı**: Kullanıcı başka bir üyenin genel görünen profilini hackleyerek biyografisini değiştirir.
* **Payload**: `UPDATE /profiles/victimUID { displayName: "Hacked!" }`
* **Sonuç**: `PERMISSION_DENIED` - Profil dökümanı sadece `userId == request.auth.uid` olan üye tarafından yazılabilir.

---

## 3. Test Runner Design

Güvenlik kurallarının çalışabilirliğini garantilemek adına yukarıdaki 12 senaryo bir simülasyon mantığı ile doğrulama aşamasında denetlenecektir. Geliştirdiğimiz kurallar bu saldırı desenlerinin tamamını engelleyecek biçimde tasarlanmıştır.
