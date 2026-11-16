/*
 * Copyright (c) 2000-2018, 达梦数据库有限公司.
 * All rights reserved.
 */

package security

import "errors"

func initThirdPartCipher(cipherPath string) error {
	return errors.New("Dameng third-party cipher is not supported on macOS")
}

func cipherGetCount() int {
	return 0
}

func cipherGetInfo(seqno, cipherId, cipherName, _type, blkSize, khSIze uintptr) {
	// No-op
}

func cipherEncryptInit(cipherId, key, keySize, cipherPara uintptr) {
	// No-op
}

func cipherGetCipherTextSize(cipherId, cipherPara, plainTextSize uintptr) uintptr {
	return 0
}

func cipherEncrypt(cipherId, cipherPara, plainText, plainTextSize, cipherText, cipherTextBufSize uintptr) uintptr {
	return 0
}

func cipherClean(cipherId, cipherPara uintptr) {
	// No-op
}

func cipherDecryptInit(cipherId, key, keySize, cipherPara uintptr) {
	// No-op
}

func cipherDecrypt(cipherId, cipherPara, cipherText, cipherTextSize, plainText, plainTextBufSize uintptr) uintptr {
	return 0
}
